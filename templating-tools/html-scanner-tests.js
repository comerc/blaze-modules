Tinytest.add("templating-tools - html scanner", function (test) {
  var testInString = function(actualStr, wantedContents) {
    if (actualStr.indexOf(wantedContents) >= 0)
      test.ok();
    else
      test.fail("Expected "+JSON.stringify(wantedContents)+
                " in "+JSON.stringify(actualStr));
  };

  var checkError = function(f, msgText, lineNum) {
    try {
      f();
    } catch (e) {
      if (! e instanceof TemplatingTools.CompileError) {
        throw e;
      }

      if (e.line === lineNum)
        test.ok();
      else
        test.fail("Error should have been on line " + lineNum + ", not " +
                  e.line);
      testInString(e.message, msgText);
      return;
    }
    test.fail("Parse error didn't throw exception");
  };

  // returns the appropriate code to put content in the body,
  // where content is something simple like the string "Hello"
  // (passed in as a source string including the quotes).
  var simpleBody = function (content) {
    return "\nTemplate.body.addContent((function() {\n  var view = this;\n  return " + content + ";\n}));\nMeteor.startup(Template.body.renderToDocument);\n";
  };

  // arguments are quoted strings like '"hello"'
  var simpleTemplate = function (templateName, content) {
    // '"hello"' into '"Template.hello"'
    var viewName = templateName.slice(0, 1) + 'Template.' + templateName.slice(1);
    var nameWithoutQuotes = templateName.slice(1,-1);
    return '\nTemplate.__checkName(' + templateName + ');\nTemplate[' + templateName +
      '] = new Template(' + viewName +
      ', (function() {\n  var view = this;\n  return ' + content + ';\n}));\n' +
      (nameWithoutQuotes.match(/^[^a-zA-Z_$]|[^0-9a-zA-Z_$]/) ? '' :
      '\nconst ' + nameWithoutQuotes + ' = Template[' + templateName + '];\n' +
      'export { ' + nameWithoutQuotes + ' };\n');
  };

  var simpleTemplateDefaultExport = function(templateName, content) {
    return simpleTemplate(templateName, content) + 'export default Template[' + templateName + '];\n';
  };

  // arguments are quoted strings like '"hello"'
  var simpleComponent = function (templateName, content) {
    // '"hello"' into '"Template.hello"'
    var viewName = templateName.slice(0, 1) + 'Template.' + templateName.slice(1);
    var nameWithoutQuotes = templateName.slice(1,-1);

    return '\nTemplate.__checkComponentName(' + templateName + ');\n' +
      'const ' + nameWithoutQuotes + ' = new Template(' + viewName +
      ', (function() {\n  var view = this;\n  return ' + content + ';\n}));\n' +
      'export { ' + nameWithoutQuotes + ' };\n';
  };

  var simpleComponentDefaultExport = function(templateName, content) {
    var nameWithoutQuotes = templateName.slice(1,-1);
    return simpleComponent(templateName, content) + 'export default ' + nameWithoutQuotes + ';\n';
  };

      var checkResults = function(results, expectJs, expectHead, expectBodyAttrs) {
    test.equal(results.body, '');
    test.equal(results.js, expectJs || '');
    test.equal(results.head, expectHead || '');
    test.equal(results.bodyAttrs, expectBodyAttrs || {});
  };

  function scanForTest(contents) {
    const tags = TemplatingTools.scanHtmlForTags({
      sourceName: "",
      contents: contents,
      tagNames: ["body", "head", "template", "component"]
    });

    return TemplatingTools.compileTagsWithSpacebars(tags);
  }

  checkError(function() {
    return scanForTest("asdf");
  }, "Expected one of: <body>, <head>, <template>", 1);

  // body all on one line
  checkResults(
    scanForTest("<body>Hello</body>"),
    simpleBody('"Hello"'));

  // multi-line body, contents trimmed
  checkResults(
    scanForTest("\n\n\n<body>\n\nHello\n\n</body>\n\n\n"),
    simpleBody('"Hello"'));

  // same as previous, but with various HTML comments
  checkResults(
    scanForTest("\n<!--\n\nfoo\n-->\n<!-- -->\n"+
                      "<body>\n\nHello\n\n</body>\n\n<!----\n>\n\n"),
    simpleBody('"Hello"'));

  // head and body
  checkResults(
    scanForTest("<head>\n<title>Hello</title>\n</head>\n\n<body>World</body>\n\n"),
    simpleBody('"World"'),
    "<title>Hello</title>");

  // head and body with tag whitespace
  checkResults(
    scanForTest("<head\n>\n<title>Hello</title>\n</head  >\n\n<body>World</body\n\n>\n\n"),
    simpleBody('"World"'),
    "<title>Hello</title>");

  // head, body, and template
  checkResults(
    scanForTest("<head>\n<title>Hello</title>\n</head>\n\n<body>World</body>\n\n"+
                      '<template name="favoritefood">\n  pizza\n</template>\n'),
    simpleBody('"World"') + simpleTemplateDefaultExport('"favoritefood"', '"pizza"'),
    "<title>Hello</title>");

  // one-line template
  checkResults(
    scanForTest('<template name="favoritefood">pizza</template>'),
    simpleTemplateDefaultExport('"favoritefood"', '"pizza"'));

  // template with other attributes
  checkResults(
    scanForTest('<template foo="bar" name="favoritefood" baz="qux">'+
                      'pizza</template>'),
    simpleTemplateDefaultExport('"favoritefood"', '"pizza"'));

  // whitespace around '=' in attributes and at end of tag
  checkResults(
    scanForTest('<template foo = "bar" name  ="favoritefood" baz= "qux"  >'+
                      'pizza</template\n\n>'),
    simpleTemplateDefaultExport('"favoritefood"', '"pizza"'));

  // whitespace around template name
  checkResults(
    scanForTest('<template name=" favoritefood  ">pizza</template>'),
    simpleTemplateDefaultExport('"favoritefood"', '"pizza"'));

  // single quotes around template name
  checkResults(
    scanForTest('<template name=\'the "cool" template\'>'+
                      'pizza</template>'),
    simpleTemplateDefaultExport('"the \\"cool\\" template"', '"pizza"'));

  checkResults(scanForTest('<body foo="bar">\n  Hello\n</body>'), simpleBody('"Hello"'), "", {foo: "bar"});

  // error cases; exact line numbers are not critical, these just reflect
  // the current implementation

  // unclosed body (error mentions body)
  checkError(function() {
    return scanForTest("\n\n<body>\n  Hello\n</body");
  }, "body", 3);

  // bad open tag
  checkError(function() {
    return scanForTest("\n\n\n<bodyd>\n  Hello\n</body>");
  }, "Expected one of: <body>, <head>, <template>", 4);
  checkError(function() {
    return scanForTest("\n\n\n\n<body foo=>\n  Hello\n</body>");
  }, "error in tag", 5);

  // unclosed tag
  checkError(function() {
    return scanForTest("\n<body>Hello");
  }, "nclosed", 2);

  // unnamed template
  checkError(function() {
    return scanForTest(
      "\n\n<template>Hi</template>\n\n<template>Hi</template>");
  }, "name", 3);


  // head, body, and component
  checkResults(
    scanForTest("<head>\n<title>Hello</title>\n</head>\n\n<body>World</body>\n\n"+
      '<component name="favoritefood">\n  pizza\n</component>\n'),
    simpleBody('"World"') + simpleComponentDefaultExport('"favoritefood"', '"pizza"'),
    "<title>Hello</title>");

  // head, body, template, and component
  checkResults(
    scanForTest("<head>\n<title>Hello</title>\n</head>\n\n<body>World</body>\n\n"+
      '<template name="favoritefood">\n  pizza\n</template>\n'+
      '<component name="favoritefood_component">\n  pizza\n</component>\n'),
      simpleBody('"World"') + simpleTemplate('"favoritefood"', '"pizza"') +
      simpleComponent('"favoritefood_component"', '"pizza"') +
      'export default Template["favoritefood"];\n\n' +
      'Template["favoritefood"].helpers({ favoritefood_component });\n\n',
    "<title>Hello</title>");

  // one-line component
  checkResults(
    scanForTest('<component name="favoritefood">pizza</component>'),
    simpleComponentDefaultExport('"favoritefood"', '"pizza"'));

  // component with other attributes
  checkResults(
    scanForTest('<component foo="bar" name="favoritefood" baz="qux">'+
      'pizza</component>'),
    simpleComponentDefaultExport('"favoritefood"', '"pizza"'));

  // whitespace around '=' in attributes and at end of tag
  checkResults(
    scanForTest('<component foo = "bar" name  ="favoritefood" baz= "qux"  >'+
      'pizza</component\n\n>'),
    simpleComponentDefaultExport('"favoritefood"', '"pizza"'));

  // whitespace around component name
  checkResults(
    scanForTest('<component name=" favoritefood  ">pizza</component>'),
    simpleComponentDefaultExport('"favoritefood"', '"pizza"'));

  checkResults(scanForTest('<body foo="bar">\n  Hello\n</body>'), simpleBody('"Hello"'), "", {foo: "bar"});

  // invalid characters component
  checkError(function() {
    return scanForTest('<component name=\'the component\'>'+
      'pizza</component>');
  }, "valid", 1);

  // unnamed component
  checkError(function() {
    return scanForTest(
      "\n\n<component>Hi</component>\n\n<component>Hi</component>");
  }, "name", 3);

  // component helpers
  checkResults(
    scanForTest("\n\n<component name='test'>Hi</component>\n\n<component name='test2'>Hi</component>"),
    '\n' +
    'Template.__checkComponentName("test");\n' +
    'const test = new Template("Template.test", (function() {\n' +
    '  var view = this;\n' +
    '  return "Hi";\n' +
    '}));\n' +
    'export { test };\n' +
    '\n' +
    'Template.__checkComponentName("test2");\n' +
    'const test2 = new Template("Template.test2", (function() {\n' +
    '  var view = this;\n' +
    '  return "Hi";\n' +
    '}));\n' +
    'export { test2 };\n' +
    'export default test;\n\n' +
    'test.helpers({ test2 });\n\n'
  );


  // helpful doctype message
  checkError(function() {
    return scanForTest(
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" '+
        '"http://www.w3.org/TR/html4/strict.dtd">'+
        '\n\n<head>\n</head>');
  }, "DOCTYPE", 1);

  // lowercase basic doctype
  checkError(function() {
    return scanForTest(
      '<!doctype html>');
  }, "DOCTYPE", 1);

  // attributes on head not supported
  checkError(function() {
    return scanForTest('<head foo="bar">\n  Hello\n</head>');
  }, "<head>", 1);

  // can't mismatch quotes
  checkError(function() {
    return scanForTest('<template name="foo\'>'+
                             'pizza</template>');
  }, "error in tag", 1);

  // unexpected <html> at top level
  checkError(function() {
    return scanForTest('\n<html>\n</html>');
  }, "Expected one of: <body>, <head>, <template>", 2);

});
