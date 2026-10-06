// Public AppKit events for isolated integration tests; not packaged in the app.
#import <AppKit/AppKit.h>
#include <node_api.h>
#include <string>

static NSDictionary *originalArguments;
static id routingMonitor;
static NSInteger passedEvents = 0;
static NSWindow *testWindow(napi_env env, napi_value value) {
  void *buffer = nullptr;
  size_t length = 0;
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer
      || napi_get_buffer_info(env, value, &buffer, &length) != napi_ok || length != sizeof(void *)) {
    napi_throw_error(env, nullptr, "Invalid test window handle");
    return nil;
  }
  return ((__bridge NSView *)(*(void **)buffer)).window;
}
static NSDictionary *options(napi_env env, napi_value value) {
  size_t length = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &length);
  std::string text(length + 1, '\0');
  napi_get_value_string_utf8(env, value, text.data(), text.size(), &length);
  return [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:text.data() length:length] options:0 error:nil];
}
static napi_value json(napi_env env, id value) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  napi_value result;
  napi_create_string_utf8(env, (const char *)data.bytes, data.length, &result);
  return result;
}
static NSDictionary *rect(NSRect value, NSWindow *window) {
  return @{@"x": @(NSMinX(value)), @"y": @(NSHeight(window.frame) - NSMaxY(value)), @"width": @(NSWidth(value)), @"height": @(NSHeight(value))};
}
static napi_value geometry(napi_env env, napi_callback_info info) {
  napi_value args[1]; size_t count = 1;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  NSWindow *window = count ? testWindow(env, args[0]) : nil;
  if (!window) return json(env, @{});
  NSMutableArray *controls = [NSMutableArray array];
  for (NSToolbarItem *item in window.toolbar.items) {
    if (item.view) [controls addObject:@{@"id": item.itemIdentifier, @"rect": rect([item.view convertRect:item.view.bounds toView:nil], window)}];
  }
  for (NSNumber *type in @[@(NSWindowCloseButton), @(NSWindowMiniaturizeButton), @(NSWindowZoomButton)]) {
    NSButton *button = [window standardWindowButton:(NSWindowButton)type.integerValue];
    if (button) [controls addObject:@{@"id": @"window-button", @"rect": rect([button convertRect:button.bounds toView:nil], window)}];
  }
  return json(env, @{@"titlebarHeight": @(NSHeight(window.frame) - NSMaxY(window.contentLayoutRect)), @"controls": controls, @"passedEvents": @(passedEvents)});
}
static napi_value postClick(napi_env env, napi_callback_info info) {
  napi_value args[2]; size_t count = 2;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  NSWindow *window = count == 2 ? testWindow(env, args[0]) : nil;
  if (window) {
    NSDictionary *values = options(env, args[1]);
    NSEventModifierFlags flags = [values[@"control"] boolValue] ? NSEventModifierFlagControl : 0;
    NSPoint location = NSMakePoint([values[@"x"] doubleValue], NSHeight(window.frame) - [values[@"y"] doubleValue]);
    NSInteger clicks = [values[@"count"] integerValue];
    for (NSInteger click = 1; click <= clicks; click++) {
      NSArray *types = [values[@"upOnly"] boolValue] ? @[@(NSEventTypeLeftMouseUp)] : @[@(NSEventTypeLeftMouseDown), @(NSEventTypeLeftMouseUp)];
      for (NSNumber *type in types) {
        NSInteger number = [values[@"routingProbe"] boolValue] ? -27100 - click : click;
        NSEvent *event = [NSEvent mouseEventWithType:(NSEventType)type.integerValue location:location modifierFlags:flags timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil eventNumber:number clickCount:click pressure:0];
        [NSApp postEvent:event atStart:NO];
      }
    }
  }
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value setAction(napi_env env, napi_callback_info info) {
  napi_value args[1]; size_t count = 1;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (!originalArguments) originalArguments = [NSUserDefaults.standardUserDefaults volatileDomainForName:NSArgumentDomain] ?: @{};
  NSMutableDictionary *domain = [originalArguments mutableCopy];
  NSDictionary *values = count ? options(env, args[0]) : @{};
  if ([values[@"action"] isKindOfClass:NSString.class]) domain[@"AppleActionOnDoubleClick"] = values[@"action"];
  else [domain removeObjectForKey:@"AppleActionOnDoubleClick"];
  // A volatile argument-domain override never writes the user's preferences.
  [NSUserDefaults.standardUserDefaults setVolatileDomain:domain forName:NSArgumentDomain];
  return json(env, @{@"action": [NSUserDefaults.standardUserDefaults stringForKey:@"AppleActionOnDoubleClick"] ?: NSNull.null});
}
static napi_value init(napi_env env, napi_value exports) {
  // Runs after the app's monitor. Record pass-through for routing probes, then
  // stop them before AppKit can reuse mouse-down state from a prior zoom test.
  routingMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseUp handler:^NSEvent *(NSEvent *event) {
    if (event.eventNumber >= -27102 && event.eventNumber <= -27101) { passedEvents++; return nil; }
    return event;
  }];
  napi_property_descriptor properties[] = {
    {"geometry", 0, geometry, 0, 0, 0, napi_default, 0},
    {"postClick", 0, postClick, 0, 0, 0, napi_default, 0},
    {"setAction", 0, setAction, 0, 0, 0, napi_default, 0}
  };
  napi_define_properties(env, exports, 3, properties);
  napi_add_env_cleanup_hook(env, [](void *) {
    if (routingMonitor) [NSEvent removeMonitor:routingMonitor];
    if (originalArguments) [NSUserDefaults.standardUserDefaults setVolatileDomain:originalArguments forName:NSArgumentDomain];
  }, nullptr);
  return exports;
}
NAPI_MODULE(formula_md_window_events, init)
