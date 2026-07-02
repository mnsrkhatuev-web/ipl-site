const http = require("http");
const handler = require("./api/index");

const port = Number(process.env.PORT || 3000);

http.createServer((req, res) => {
    handler(req, res).catch((error) => {
        console.error(error);
        res.statusCode = 500;
        res.end("Internal Server Error");
    });
}).listen(port, () => {
    console.log(`OAuth proxy listening on ${port}`);
});
