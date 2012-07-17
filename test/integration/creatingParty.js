var soda = require('soda');
var assert = require('assert');

var browser = soda.createSauceClient({
    'url': 'http://funbox.duostack.net/',
    'username': 'mdmurray',
    'access-key': 'af445dbe-8c58-447e-a8bf-50f85d0c1fca',
    "os": "Windows 2003",
    "browser": "firefox",
    "browser-version": "3.6",
    "name": "Creating a party",
    "max-duration": 200
});

browser
  .chain
  .session()
  .open('/')
  .clickAndWait("link=Create Party")
  // enter credentials
  .clickAndWait("Allow")
  .testComplete()
  .end(function(err){
    if (err) throw err;
    console.log('Passed!');
  });