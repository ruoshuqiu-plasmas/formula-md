window.MathJax = {
  loader: {
    load: [
      '[tex]/ams',
      '[tex]/autoload',
      '[tex]/boldsymbol',
      '[tex]/cancel',
      '[tex]/cases',
      '[tex]/centernot',
      '[tex]/color',
      '[tex]/configmacros',
      '[tex]/enclose',
      '[tex]/html',
      '[tex]/mathtools',
      '[tex]/mhchem',
      '[tex]/newcommand',
      '[tex]/noerrors',
      '[tex]/noundefined',
      '[tex]/physics',
      '[tex]/textmacros',
      '[tex]/unicode'
    ]
  },
  tex: {
    packages: {
      '[+]': [
        'ams',
        'autoload',
        'boldsymbol',
        'cancel',
        'cases',
        'centernot',
        'color',
        'configmacros',
        'enclose',
        'html',
        'mathtools',
        'mhchem',
        'newcommand',
        'noerrors',
        'noundefined',
        'physics',
        'textmacros',
        'unicode'
      ]
    },
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true,
    tags: 'ams',
    useLabelIds: true,
    maxMacros: 10000,
    maxBuffer: 10 * 1024
  },
  chtml: {
    scale: 1,
    displayAlign: 'center',
    displayIndent: '0'
  },
  options: {
    enableMenu: true,
    menuOptions: {
      settings: {
        assistiveMml: true,
        collapsible: false,
        explorer: false
      }
    },
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
  },
  startup: {
    typeset: false
  }
};

