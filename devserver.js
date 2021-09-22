var
http = require("http"),
url  = require("url"),
path = require("path"),
fs   = require("fs"),
port = process.argv[2] || process.env['PORT'] || 8080;

http.createServer(function(request, response) {

  var uri = url.parse(request.url).pathname
  var filename = path.join(process.cwd(), 'build', uri);

  fs.exists(filename, function(exists) {
    if(!exists) {
      console.log("not exist filename: ", filename);
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.write("404 Not Found\n");
      response.end();
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += '/index.html';

    fs.readFile(filename, "binary", function(err, file) {
      if(err) {
        console.log("err filename: ", filename);
        response.writeHead(500, {"Content-Type": "text/plain"});
        response.write(err + "\n");
        response.end();
        return;
      }

        
      console.log("filename: ", filename);
      response.writeHead(200);
      response.write(file, "binary");
      response.end();
    });
  });
}).listen(parseInt(port, 10));

console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");
