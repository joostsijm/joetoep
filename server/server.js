var socketio = require('socket.io'),
	send     = require('send'),
	http     = require('http'),
	https    = require('https'),
	path     = require('path'),
	url      = require('url'),
	fs       = require('fs');

var config        = JSON.parse(fs.readFileSync(
	path.join(path.dirname(__dirname), 'config.json'), 'utf8'));
var clientConfig  = '$(document).ready(function () { ' +
		'document.joetoep = new JoeToepInterface(' + 
			JSON.stringify(config.clientConfig) + '); ' +
		'});';

var clientFiles = path.join(path.dirname(__dirname), 'client');
var roomDir     = path.join(path.dirname(__dirname), 'rooms');

var app = http.createServer(function (req, res) {
	var requrl = url.parse(req.url);

	var host = config.clientConfig.host;
		host = host.substring(7, host.length - 1);

	if (requrl.path == '/' && req.headers['host'] != host && requrl.path == '/') {
		res.writeHead(301, { 'Location': config.clientConfig.host });
		res.end();
		return;
	}

	if (requrl.path == '/config.js') {
		res.writeHead(200, {
			'Content-Length': clientConfig.length,
			'Content-Type': 'application/javascript' });
		res.end(clientConfig, 'utf-8');
	} else {
		send(req, req.url)
			.from(clientFiles)
			.pipe(res);
	}
});

var playlist = {};

var io = socketio.listen(app);

io.use('browser client etag');
io.set('transports', ['xhr-polling', 'jsonp-polling']);

io.sockets.on('connection', function (socket) {
	var room = null;

	socket.on('subscribe', function (subRoom) {
		if (room) {
			return;
		}

		room = subRoom.toLowerCase();

		socket.join(room);

		if (!playlist[room])
			playlist[room] = [];
	});

	socket.on('unsubscribe', function () {
		if (!room) {
			return;
		}

		socket.leave(room);
		room = null;
	});

	socket.on('search', function (data) {
		if (data.query && data.query.length > 0) {
			search(data.query, function (results) {
				socket.emit('search-results', 
					{ query: data.query, results: results });
			});
		}
	});

	socket.on('get-playlist', function () {
		if (!room) {
			return;
		}

		socket.emit('playlist', playlist[room]);
	});

	socket.on('add', function (data) {
		if (!room) {
			return;
		}
		
		if (playlist[room].length > 0 
			&& playlist[room][playlist[room].length - 1].id == data.id) {
			return;
		}

		playlist[room].push(data);
		io.sockets.in(room).emit('playlist', playlist[room]);

		fs.exists(roomDir, function (exists) {
			if (exists) {
				fs.appendFile(path.join(roomDir, room), data.title + ' ('+data.id+')\n');
			}
		});
	});

	socket.on('consume', function () {
		if (!room) {
			return;
		}

		playlist[room].shift();
		io.sockets.in(room).emit('playlist', playlist[room]);
	});

	socket.on('pauseplay', function () {
		if (!room) {
			return;
		}

		io.sockets.in(room).emit('pauseplay');
	});

	socket.on('skip', function () {
		if (!room) {
			return;
		}
		
		io.sockets.in(room).emit('skip');
	});
});

var search = function (query, callback) {
	searchRequest(query, function (results) {
		var searchResults = [];

		var resultsObject = JSON.parse(results);

		if (resultsObject.items) {
			resultsObject.items.forEach(function (entry) {
				searchResults.push({
					id:    entry.id.videoId,
					title: entry.snippet.title,
					thumb: entry.snippet.thumbnails.default.url
				});
			});
		}
		
		callback(searchResults);
	});
}

var searchRequest = function (query, callback) {
	// var url = 'https://www.googleapis.com/youtube/v3/search?key=' + config.youtubeKey + '&part=snippet&maxResults=25&type=video&q=';
	var url = 'https://www.googleapis.com/youtube/v3/search?key=AIzaSyBdTSLt9gur6ZjcMdt_0Ch9C2tyopY1Eek&part=snippet&maxResults=25&type=video&q=';
	https.get(url + encodeURIComponent(query), function (res) {
		var body = '';

		res.on('data', function (chunk) {
			body += chunk;
		});

		res.on('end', function() {
			callback(body);
		});
	});
}

app.listen(config.port);
