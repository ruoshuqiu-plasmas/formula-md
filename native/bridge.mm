#import <AppKit/AppKit.h>
#include <node_api.h>
#include <string>

static napi_threadsafe_function eventFunction = nullptr;
static void emit(NSDictionary *event) {
  if (!eventFunction) return;
  NSData *data = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
  std::string *value = new std::string((const char *)data.bytes, data.length);
  if (napi_call_threadsafe_function(eventFunction, value, napi_tsfn_nonblocking) != napi_ok) delete value;
}
static NSColor *color(NSString *hex) {
  unsigned int rgb = 0;
  if (![hex isKindOfClass:NSString.class] || hex.length != 7) return NSColor.controlAccentColor;
  [[NSScanner scannerWithString:[hex substringFromIndex:1]] scanHexInt:&rgb];
  return [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
}
static NSString *hexColor(NSColor *value) {
  NSColor *c = [value colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
  return [NSString stringWithFormat:@"#%02x%02x%02x", (int)round(c.redComponent * 255), (int)round(c.greenComponent * 255), (int)round(c.blueComponent * 255)];
}

@interface FMController : NSObject <NSToolbarDelegate, NSSearchFieldDelegate, NSTextFieldDelegate, NSWindowDelegate>
@property(weak) NSWindow *window;
@property(weak) NSView *webView;
@property(strong) NSToolbar *toolbar;
@property(strong) NSMutableDictionary<NSString *, NSControl *> *controls;
@property(strong) NSPanel *panel;
@property(strong) NSMutableDictionary<NSString *, NSControl *> *settingsControls;
@property(strong) NSMutableSet<NSString *> *editingColors;
@property(strong) NSDictionary *appearance;
@property(strong) NSDictionary *ui;
- (void)attach:(NSView *)view;
- (void)sync:(NSDictionary *)state;
- (void)showSettings;
- (void)refreshSettings;
- (void)dispose;
@end
@implementation FMController
- (void)attach:(NSView *)view {
  self.window = view.window;
  self.webView = view;
  self.controls = [NSMutableDictionary dictionary];
  self.toolbar = [[NSToolbar alloc] initWithIdentifier:@"formula-md-toolbar-v2"];
  self.toolbar.delegate = self;
  self.toolbar.displayMode = NSToolbarDisplayModeIconOnly;
  self.toolbar.allowsUserCustomization = NO;
  self.window.toolbar = self.toolbar;
  self.window.toolbarStyle = NSWindowToolbarStyleUnified;
  self.window.titleVisibility = NSWindowTitleVisible;
}
- (NSArray<NSToolbarItemIdentifier> *)toolbarDefaultItemIdentifiers:(NSToolbar *)toolbar {
  return @[@"new", @"open", NSToolbarFlexibleSpaceItemIdentifier, @"mode", @"save", @"image", @"pdf", NSToolbarFlexibleSpaceItemIdentifier, @"search", @"settings"];
}
- (NSArray<NSToolbarItemIdentifier> *)toolbarAllowedItemIdentifiers:(NSToolbar *)toolbar { return [self toolbarDefaultItemIdentifiers:toolbar]; }
- (NSToolbarItem *)toolbar:(NSToolbar *)toolbar itemForItemIdentifier:(NSToolbarItemIdentifier)identifier willBeInsertedIntoToolbar:(BOOL)inserted {
  NSToolbarItem *item = [[NSToolbarItem alloc] initWithItemIdentifier:identifier];
  if ([identifier isEqual:@"mode"]) {
    NSSegmentedControl *control = [NSSegmentedControl segmentedControlWithLabels:@[@"阅读", @"编辑"] trackingMode:NSSegmentSwitchTrackingSelectOne target:self action:@selector(modeChanged:)];
    control.selectedSegment = 0;
    control.accessibilityLabel = @"查看模式";
    item.label = @"查看模式";
    item.view = control;
    self.controls[identifier] = control;
  } else if ([identifier isEqual:@"search"]) {
    NSSearchField *field = [[NSSearchField alloc] initWithFrame:NSMakeRect(0, 0, 185, 28)];
    field.placeholderString = @"在文档中查找";
    field.accessibilityLabel = @"在文档中查找";
    field.delegate = self;
    field.target = self;
    field.action = @selector(searchNext:);
    field.sendsSearchStringImmediately = YES;
    item.label = @"查找";
    item.view = field;
    self.controls[identifier] = field;
  } else {
    NSDictionary *labels = @{@"new": @"新建 Markdown", @"open": @"打开 Markdown", @"save": @"保存", @"image": @"插入图片", @"pdf": @"导出 PDF", @"settings": @"外观与图片设置"};
    NSDictionary *symbols = @{@"new": @"doc.badge.plus", @"open": @"folder", @"save": @"square.and.arrow.down", @"image": @"photo.badge.plus", @"pdf": @"doc.richtext", @"settings": @"slider.horizontal.3"};
    NSString *label = labels[identifier] ?: identifier;
    NSButton *button = [NSButton buttonWithTitle:label target:self action:@selector(command:)];
    button.identifier = identifier;
    button.toolTip = label;
    button.accessibilityLabel = label;
    button.image = [NSImage imageWithSystemSymbolName:symbols[identifier] accessibilityDescription:label];
    button.imagePosition = NSImageOnly;
    if (@available(macOS 26.0, *)) button.bezelStyle = NSBezelStyleGlass;
    item.label = label;
    item.view = button;
    self.controls[identifier] = button;
    // The button supplies its own system glass bezel.
    item.bordered = NO;
  }
  return item;
}
- (void)command:(NSButton *)sender { emit(@{@"command": sender.identifier}); }
- (void)modeChanged:(NSSegmentedControl *)sender { emit(@{@"command": @"mode", @"value": @(sender.selectedSegment == 1)}); }
- (void)searchNext:(NSSearchField *)sender {
  emit(@{@"command": @"searchNext", @"value": @((NSApp.currentEvent.modifierFlags & NSEventModifierFlagShift) ? -1 : 1)});
}
- (void)controlTextDidChange:(NSNotification *)notification {
  if (notification.object == self.controls[@"search"]) emit(@{@"command": @"search", @"value": [notification.object stringValue]});
  else if ([notification.object isKindOfClass:NSTextField.class]) [self.editingColors addObject:[notification.object identifier]];
}
- (BOOL)control:(NSControl *)control textView:(NSTextView *)textView doCommandBySelector:(SEL)selector {
  if (control == self.controls[@"search"] && selector == @selector(cancelOperation:)) {
    [(NSSearchField *)control setStringValue:@""];
    emit(@{@"command": @"search", @"value": @""});
    [self.window makeFirstResponder:self.webView];
    return YES;
  }
  return NO;
}
- (void)sync:(NSDictionary *)state {
  NSString *oldPalette = self.appearance[@"palette"];
  self.appearance = state[@"appearance"] ?: self.appearance;
  if (![oldPalette isEqual:self.appearance[@"palette"]]) [self.editingColors removeAllObjects];
  self.ui = state[@"ui"] ?: self.ui;
  BOOL hasDocument = [self.ui[@"hasDocument"] boolValue];
  for (NSString *key in @[@"save", @"image", @"pdf", @"mode", @"search"]) self.controls[key].enabled = hasDocument;
  self.controls[@"save"].enabled = hasDocument && [self.ui[@"dirty"] boolValue] && ![self.ui[@"saving"] boolValue];
  self.controls[@"pdf"].enabled = hasDocument && ![self.ui[@"exporting"] boolValue];
  [(NSSegmentedControl *)self.controls[@"mode"] setSelectedSegment:[self.ui[@"editing"] boolValue] ? 1 : 0];
  self.window.title = self.ui[@"title"] ?: @"Formula MD";
  BOOL dark = [self.appearance[@"theme"] isEqual:@"dark"];
  self.window.appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
  self.panel.appearance = self.window.appearance;
  NSColor *tint = color(self.appearance[@"colors"][@"accent"]);
  for (NSControl *control in self.controls.allValues) {
    if ([control isKindOfClass:NSButton.class]) [(NSButton *)control setBezelColor:tint];
  }
  NSSearchField *search = (NSSearchField *)self.controls[@"search"];
  search.toolTip = [NSString stringWithFormat:@"在文档中查找 %@", self.ui[@"searchCount"] ?: @""];
  [self refreshSettings];
}
- (NSStackView *)row:(NSString *)label control:(NSView *)control {
  NSTextField *text = [NSTextField labelWithString:label];
  [text.widthAnchor constraintEqualToConstant:125].active = YES;
  NSStackView *row = [NSStackView stackViewWithViews:@[text, control]];
  row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  row.spacing = 16;
  row.alignment = NSLayoutAttributeCenterY;
  return row;
}
- (void)showSettings {
  if (!self.panel) {
    self.panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, 560, 560) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
    self.panel.title = @"外观与图片设置";
    self.panel.releasedWhenClosed = NO;
    self.settingsControls = [NSMutableDictionary dictionary];
    self.editingColors = [NSMutableSet set];
    NSStackView *stack = [NSStackView stackViewWithViews:@[]];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeLeading;
    stack.spacing = 18;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [self.panel.contentView addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[[stack.leadingAnchor constraintEqualToAnchor:self.panel.contentView.leadingAnchor constant:28], [stack.topAnchor constraintEqualToAnchor:self.panel.contentView.topAnchor constant:28], [stack.trailingAnchor constraintLessThanOrEqualToAnchor:self.panel.contentView.trailingAnchor constant:-28]]];
    for (NSString *key in @[@"theme", @"palette"]) {
      NSPopUpButton *menu = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 0, 300, 28) pullsDown:NO];
      menu.identifier = key; menu.target = self; menu.action = @selector(settingChanged:);
      if ([key isEqual:@"theme"]) [menu addItemsWithTitles:@[@"跟随系统", @"浅色", @"深色"]];
      else for (NSDictionary *entry in self.appearance[@"paletteList"]) { [menu addItemWithTitle:entry[@"name"]]; menu.lastItem.representedObject = entry[@"id"]; }
      self.settingsControls[key] = menu;
      [stack addArrangedSubview:[self row:[key isEqual:@"theme"] ? @"显示模式" : @"配色预设" control:menu]];
    }
    NSSlider *slider = [NSSlider sliderWithValue:20 minValue:0 maxValue:100 target:self action:@selector(settingChanged:)];
    slider.identifier = @"opacity"; slider.continuous = YES; slider.accessibilityLabel = @"界面背景透明度";
    [slider.widthAnchor constraintEqualToConstant:220].active = YES;
    NSTextField *value = [NSTextField labelWithString:@"20%"];
    self.settingsControls[@"opacity"] = slider; self.settingsControls[@"opacityLabel"] = value;
    [stack addArrangedSubview:[self row:@"背景透明度" control:[NSStackView stackViewWithViews:@[slider, value]]]];
    NSArray *keys = @[@"accent", @"chrome", @"page", @"text"];
    NSArray *labels = @[@"强调色", @"界面底色", @"正文底色", @"文字颜色"];
    for (NSUInteger i = 0; i < keys.count; i++) {
      NSString *key = keys[i];
      NSColorWell *well = [[NSColorWell alloc] initWithFrame:NSMakeRect(0, 0, 45, 28)];
      well.identifier = key; well.target = self; well.action = @selector(colorChanged:); if (@available(macOS 14.0, *)) well.supportsAlpha = NO;
      NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 125, 28)];
      field.identifier = key; field.target = self; field.action = @selector(hexChanged:); field.delegate = self;
      field.font = [NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular];
      [field.widthAnchor constraintEqualToConstant:125].active = YES;
      self.settingsControls[key] = well; self.settingsControls[[key stringByAppendingString:@"Hex"]] = field;
      [stack addArrangedSubview:[self row:labels[i] control:[NSStackView stackViewWithViews:@[well, field]]]];
    }
    NSButton *remote = [NSButton checkboxWithTitle:@"允许加载 HTTP / HTTPS 网络图片" target:self action:@selector(settingChanged:)];
    remote.identifier = @"remote"; self.settingsControls[@"remote"] = remote;
    [stack addArrangedSubview:remote];
    NSTextField *note = [NSTextField wrappingLabelWithString:@"透明度仅调整外围背景；正文、图片与文字保持清晰。\n原生玻璃材质由系统调节，辅助功能设置优先生效。"];
    note.textColor = NSColor.secondaryLabelColor; note.font = [NSFont systemFontOfSize:12];
    [stack addArrangedSubview:note];
    NSButton *reset = [NSButton buttonWithTitle:@"恢复当前预设颜色" target:self action:@selector(resetColors:)];
    if (@available(macOS 26.0, *)) reset.bezelStyle = NSBezelStyleGlass;
    [stack addArrangedSubview:reset];
    [self.panel center];
  }
  [self refreshSettings];
  self.panel.appearance = self.window.appearance;
  [self.panel makeKeyAndOrderFront:nil];
}
- (void)refreshSettings {
  if (!self.panel) return;
  NSDictionary *settings = self.appearance[@"settings"];
  NSUInteger mode = [@[@"system", @"light", @"dark"] indexOfObject:settings[@"theme"] ?: @"system"];
  [(NSPopUpButton *)self.settingsControls[@"theme"] selectItemAtIndex:mode == NSNotFound ? 0 : mode];
  NSPopUpButton *palette = (NSPopUpButton *)self.settingsControls[@"palette"];
  for (NSMenuItem *item in palette.itemArray) if ([item.representedObject isEqual:self.appearance[@"palette"]]) [palette selectItem:item];
  double transparency = (1 - [settings[@"chromeOpacity"] doubleValue]) * 100;
  self.settingsControls[@"opacity"].doubleValue = transparency;
  self.settingsControls[@"opacityLabel"].stringValue = [NSString stringWithFormat:@"%.0f%%", transparency];
  self.settingsControls[@"opacity"].enabled = ![self.appearance[@"reducedTransparency"] boolValue] && ![self.appearance[@"highContrast"] boolValue];
  [(NSButton *)self.settingsControls[@"remote"] setState:[settings[@"allowRemoteImages"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff];
  for (NSString *key in @[@"accent", @"chrome", @"page", @"text"]) {
    [(NSColorWell *)self.settingsControls[key] setColor:color(self.appearance[@"colors"][key])];
    NSTextField *field = (NSTextField *)self.settingsControls[[key stringByAppendingString:@"Hex"]];
    if (![self.editingColors containsObject:key]) {
      field.stringValue = self.appearance[@"colors"][key] ?: @"#000000";
      if (field.currentEditor) field.currentEditor.string = field.stringValue;
    }
  }
}
- (void)settingChanged:(NSControl *)sender {
  NSDictionary *patch;
  if ([sender.identifier isEqual:@"theme"]) patch = @{@"theme": @[@"system", @"light", @"dark"][(NSUInteger)[(NSPopUpButton *)sender indexOfSelectedItem]]};
  else if ([sender.identifier isEqual:@"palette"]) patch = @{@"palette": [(NSPopUpButton *)sender selectedItem].representedObject};
  else if ([sender.identifier isEqual:@"opacity"]) patch = @{@"chromeOpacity": @(1 - sender.doubleValue / 100)};
  else patch = @{@"allowRemoteImages": @([(NSButton *)sender state] == NSControlStateValueOn)};
  emit(@{@"settings": patch});
}
- (void)colorChanged:(NSColorWell *)sender { emit(@{@"settings": @{@"colors": @{@"palette": self.appearance[@"palette"], sender.identifier: hexColor(sender.color)}}}); }
- (void)hexChanged:(NSTextField *)sender {
  NSString *value = sender.stringValue;
  [self.editingColors removeObject:sender.identifier];
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^#[0-9a-fA-F]{6}$" options:0 error:nil];
  if ([regex numberOfMatchesInString:value options:0 range:NSMakeRange(0, value.length)]) emit(@{@"settings": @{@"colors": @{@"palette": self.appearance[@"palette"], sender.identifier: value}}});
  else { NSBeep(); sender.stringValue = self.appearance[@"colors"][sender.identifier]; }
}
- (void)controlTextDidEndEditing:(NSNotification *)notification {
  if ([notification.object isKindOfClass:NSTextField.class] && [self.editingColors containsObject:[notification.object identifier]]) [self hexChanged:notification.object];
}
- (void)resetColors:(id)sender { emit(@{@"settings": @{@"resetPalette": self.appearance[@"palette"]}}); }
- (void)dispose {
  [self.panel close]; self.panel = nil;
  self.window.toolbar = nil; self.toolbar.delegate = nil; self.toolbar = nil;
  [self.controls removeAllObjects]; self.window = nil;
}
@end
static FMController *controller;
static napi_value undefined(napi_env env) { napi_value value; napi_get_undefined(env, &value); return value; }
static napi_value json(napi_env env, id object) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  napi_value result; napi_create_string_utf8(env, (const char *)data.bytes, data.length, &result); return result;
}
static NSDictionary *argument(napi_env env, napi_callback_info info) {
  napi_value args[1]; size_t argc = 1; napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  size_t length = 0; if (!argc || napi_get_value_string_utf8(env, args[0], nullptr, 0, &length) != napi_ok) return @{};
  std::string value(length + 1, '\0'); napi_get_value_string_utf8(env, args[0], value.data(), value.size(), &length);
  id result = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:value.data() length:length] options:0 error:nil];
  return [result isKindOfClass:NSDictionary.class] ? result : @{};
}
static void stop() {
  [controller dispose]; controller = nil;
  if (eventFunction) { napi_release_threadsafe_function(eventFunction, napi_tsfn_abort); eventFunction = nullptr; }
}
static napi_value supported(napi_env env, napi_callback_info info) {
  BOOL ok = NO; if (@available(macOS 26.0, *)) ok = YES;
  napi_value value; napi_get_boolean(env, ok, &value); return value;
}
static napi_value attach(napi_env env, napi_callback_info info) {
  stop();
  napi_value args[2]; size_t argc = 2; napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  void *buffer; size_t length; bool isBuffer = false;
  if (argc != 2 || napi_is_buffer(env, args[0], &isBuffer) != napi_ok || !isBuffer || napi_get_buffer_info(env, args[0], &buffer, &length) != napi_ok || length != sizeof(void *)) { napi_throw_error(env, nullptr, "Invalid native window handle"); return undefined(env); }
  NSView *view = (__bridge NSView *)(*(void **)buffer);
  if (!view.window) { napi_throw_error(env, nullptr, "Native window is unavailable"); return undefined(env); }
  napi_value name; napi_create_string_utf8(env, "Formula MD AppKit", NAPI_AUTO_LENGTH, &name);
  napi_create_threadsafe_function(env, args[1], nullptr, name, 0, 1, nullptr, nullptr, nullptr,
    [](napi_env env, napi_value callback, void *, void *data) {
      std::string *value = (std::string *)data;
      if (env) { napi_value arg, receiver; napi_create_string_utf8(env, value->data(), value->size(), &arg); napi_get_undefined(env, &receiver); napi_call_function(env, receiver, callback, 1, &arg, nullptr); }
      delete value;
    }, &eventFunction);
  napi_unref_threadsafe_function(env, eventFunction);
  controller = [FMController new]; [controller attach:view];
  return undefined(env);
}
static napi_value syncState(napi_env env, napi_callback_info info) { [controller sync:argument(env, info)]; return undefined(env); }
static napi_value showSettings(napi_env env, napi_callback_info info) { [controller showSettings]; return undefined(env); }
static napi_value focusSearch(napi_env env, napi_callback_info info) { [controller.window makeFirstResponder:controller.controls[@"search"]]; return undefined(env); }
static napi_value dispose(napi_env env, napi_callback_info info) { stop(); return undefined(env); }
static napi_value diagnostics(napi_env env, napi_callback_info info) {
  NSMutableArray *controls = [NSMutableArray array];
  for (NSString *key in controller.controls) {
    NSControl *control = controller.controls[key];
    [controls addObject:@{@"id": key, @"class": NSStringFromClass(control.class), @"enabled": @(control.enabled), @"glass": @([control isKindOfClass:NSButton.class] && [(NSButton *)control bezelStyle] == 16)}];
  }
  return json(env, @{@"attached": @(controller.window.toolbar == controller.toolbar && controller != nil), @"controls": controls, @"settingsClass": controller.panel ? NSStringFromClass(controller.panel.class) : @"", @"title": controller.window.title ?: @""});
}
// Main-process test harness only; never exposed through the renderer bridge.
static napi_value perform(napi_env env, napi_callback_info info) {
  NSDictionary *args = argument(env, info);
  NSControl *control = controller.controls[args[@"id"]];
  if (control.enabled) [control performClick:nil];
  return undefined(env);
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"isSupported", 0, supported, 0, 0, 0, napi_default, 0}, {"attach", 0, attach, 0, 0, 0, napi_default, 0},
    {"sync", 0, syncState, 0, 0, 0, napi_default, 0}, {"showSettings", 0, showSettings, 0, 0, 0, napi_default, 0},
    {"focusSearch", 0, focusSearch, 0, 0, 0, napi_default, 0}, {"dispose", 0, dispose, 0, 0, 0, napi_default, 0},
    {"diagnostics", 0, diagnostics, 0, 0, 0, napi_default, 0}, {"perform", 0, perform, 0, 0, 0, napi_default, 0}
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  napi_add_env_cleanup_hook(env, [](void *) { stop(); }, nullptr);
  return exports;
}
NAPI_MODULE(formula_md_native, init)
