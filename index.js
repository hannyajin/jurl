var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');

var auth = require('./auth.json');
var hashids = new require('hashids')(auth.salt);

var uri = "mongodb://<dbuser>:<dbpassword>@ds045011.mongolab.com:45011/jurl";
uri = uri.replace('<dbuser>', auth.dbuser).replace('<dbpassword>', auth.dbpassword);

console.log(uri);
console.log("hash id test: " + hashids.encode(0));

mongoose.connect(uri);
var db = mongoose.connection;

var urlSchema = mongoose.Schema({
  hash: String,
  url: String
});

var Url = mongoose.model('Url', urlSchema);

var cache = {
  test: "http://localhost:3000/test_page"
};
// hash : url
var list = [];

// keep track of collection size, vital for unique ids
var counter = null;

db.once('open', function () {
  console.log("mongo open");

  Url.count(function (err, count) {
    if (err) {
      console.log("Error: failed to update counter");
      return;
    }
    counter = count;
    console.log("counter set to: " + counter);

    init();
  })
});


// initialize and start app
function init() {
  var app = express();
  app.use(bodyParser.json());

  function handleError(err, res) {
    return res.status(500);
  }

  app.get('/:path', function (req, res) {
    var params = req.params;
    console.log("path: " + params.path);

    var hash = params.path;
    console.log("in /:hash with [" + hash + "]");

    if (!hash) {
      // 400 bad request
      return res.status(400).end();
    }

    var redirect_url = cache[hash];
    if (redirect_url) {
      // 303 - see other (302 for pre HTTP/1.1)
      // http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
      // 4.x express redirect defaults to 302
      return res.redirect(redirect_url);
    }

    // check mongo
    Url.findOne({ hash: hash }, function (err, doc) {
      if (err)
        return handleError(err, res);
      if (doc) {
        // save to cache
        cache[hash] = doc.url;
        return res.redirect(doc.url);
      } else {
        //return res.status(404).send("404 not found");;
        return res.redirect("http://bittysound.jin.fi/");
      }
    });
  }); // app.get

  app.post('/post', function (req, res) {
    console.log("in /post");
    var json = req.body;

    var url = json.url;
    if (!url) {
      return res.status(406).send("invalid json").end();
    }

    String.prototype.startsWith = function (str) {
      return this.substring(0, str.length) === str;
    }
    if (!(url.startsWith("http://") || url.startsWith("https://"))) {
      url = "http://" + url;
    }

    if (url.indexOf('jin.fi/') > 0) {
      var hash = hashids.encode(counter++);
      var doc = new Url({hash: hash, url: url});
      doc.save(function (err, docs) {
        if (err)
          return handleError(err, res);

        console.log("created hash for: " + url + " @ /" + hash);
        // cache it
        cache[hash] = url;
        // send link to user, 201 Created
        res.status(201).json({
          status: 201,
          message: "Short link Created",
          url: (process.env.HOST || "url.jin.fi") + "/" + hash,
          src: url,
          hash: hash
        });
      });
    } else {
      console.log("url not accepted, not in jin.fi domain");
      // 406 not acceptable
      res.status(406).send("url not acceptable for shortening.");
    }
  });

  var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log("listening at http://%s:%s", host, port);
  });
}
