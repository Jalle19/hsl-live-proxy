/**
 * hsl-live-proxy.js
 * @author Sam Stenvall <sam.stenvall@arcada.fi>
 * @license MIT License
 */

/*
 * Some constants
 */
var API_HOSTNAME = '83.145.232.209',
		API_PORT = 8080;

/*
 * Include libraries
 */
var net = require('net');
var winston = require('winston');
var argv = require('yargs');
var WebSocketServer = require('ws').Server;

// Represents a row of data from the HSL API
var DataPoint = require('./datapoint.js');

/*
 * Configure and parse command line arguments
 */
argv = argv
		.usage('Usage: $0 -u <username> -p <password> [[-P <port>] [-l <logfile>]]')
		.alias('u', 'username')
		.alias('p', 'password')
		.alias('P', 'port')
		.alias('l', 'logfile')
		.default('P', 8080)
		.demand(['u', 'p'])
		.describe('u', 'The username for the HSL API')
		.describe('p', 'The password for the HSL API')
		.describe('P', 'The port to listen for WebSocket connections on')
		.describe('l', 'The path to the log file that should be used')
		.argv;

/**
 * Configure the logger
 */
// Reconfigure the default console logger
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
	timestamp: true,
	colorize: true,
	level: 'debug'
});

// Add optional file logging
if (argv.logfile !== undefined)
{
	winston.add(winston.transports.File, {
		filename: argv.logfile,
		level: 'debug',
		json: false
	});
}

/**
 * The socket to HSL
 * @type @exp;net@call;connect
 */
var server;

/**
 * On connect handler for the HSL client
 * @returns {undefined}
 */
var onHslConnect = function() {
	winston.info('Successfully connected to ' + API_HOSTNAME + ':' + API_PORT);
	winston.info('Sending authentication');

	// Subscribe to all updates. Despite what the API documentation says, a 
	// filtering parameter is needed so we use "onroute = 1" since that filters 
	// out the least amount of data
	this.write('&' + argv.username + ';' + argv.password + ' onroute:1&');
};

/**
 * On data received handler for the HSL client
 * @param {type} rawData the raw data
 * @returns {undefined}
 */
var onHslData = function(rawData) {
	// The raw data is binary
	var data = rawData.toString();

	if (data === "\r")
		winston.debug("Received PING from server");
	else
		handleDataBatch(data);
};

/**
 * Handles a batch of incoming data. The API pushes updates in batches of 
 * varying size so we need to split each batch up into individual messages and 
 * broadcast them to the clients that subscribe to them.
 * @param {type} batch
 * @returns {undefined}
 */
var handleDataBatch = function(batch)
{
	// Create an object for each data point
	var dataPoints = batch.split("\r\n");

	for (var i in dataPoints)
	{
		// Skip the last item, it's an empty row
		if (dataPoints[i] === "")
			break;

		// Split the string and create an object
		var columns = dataPoints[i].split(';');

		var dataPoint = new DataPoint({
			id: columns[0],
			name: columns[1],
			type: parseInt(columns[2]),
			ip: columns[3],
			lat: columns[4],
			lng: columns[5],
			speed: columns[6],
			bearing: columns[7],
			acceleration: columns[8],
			gpsTimeDifference: columns[9],
			UnixEpochGpsTime: columns[10],
			lowfloor: columns[11],
			route: columns[12],
			direction: columns[13],
			departure: columns[14],
			departureTime: columns[15],
			departureStartsIn: columns[16],
			distanceFromStart: columns[17],
			snappedLat: columns[18],
			snappedLng: columns[19],
			snappedBearing: columns[20],
			nextStopIndex: columns[21],
			onStop: columns[22],
			differenceFromTimetable: columns[23]
		});

		// Broadcast the data point to all clients
		broadcastDataPoint(dataPoint);
	}

	// Inform clients that a full batch has been received
	broadcast('batchComplete');

	winston.debug('Received ' + dataPoints.length + ' data points in the last batch (' + batch.length + ' bytes)');
};

var connectToHsl = function() {
	var clientParams = {
		host: API_HOSTNAME,
		port: API_PORT
	};

	server = net.connect(clientParams, onHslConnect);
	server.on('data', onHslData);
};

var disconnectFromHsl = function() {
	if (server !== undefined)
	{
		server.destroy();
		server = undefined;
	}
};

var handleUpdateSubscription = function(client, subscription) {
	// Connect to the HSL API if we aren't connected
	if (server === undefined)
		connectToHsl();

	winston.info('Got client subscription:', subscription);
	client.subscription = subscription;
};

// Start a WebSocket server for client connections
var wss = new WebSocketServer({
	port: argv.port
}, function() {
	winston.info('WebSocket server started, waiting for connections on port ' + argv.port + ' ...');
});

wss.on('connection', function(client) {
	winston.info('Got new client connection, waiting for subscription ...');

	// Client will not receive any messages until it has made a subscription
	client.subscription = null;

	// Handle messages from clients
	client.on('message', function(data) {
		var message = JSON.parse(data);

		// Delegate to other methods
		switch (message.msg)
		{
			case 'updateSubscription':
				handleUpdateSubscription(client, message.subscription);
				break;
			default:
				winston.warn('Unhandled message "' + message.msg + '" received');
		}
	});

	/**
	 * Called when a client disconnects
	 */
	client.on('close', function() {
		winston.info('Client disconnected');

		// Disconenct from the HSL API if there are no more connected clients
		if (wss.clients.length === 0)
		{
			winston.info('No more connected clients, disconnecting from HSL');
			disconnectFromHsl();
		}
	});
});

/**
 * Broadcasts the specified data point to all connected clients that are 
 * interested in it (i.e. they have a matching subscription)
 * @param {DataPoint} dataPoint
 * @returns {undefined}
 */
var broadcastDataPoint = function(dataPoint) {
	broadcast(dataPoint, function(dataPoint, client) {
		var subscription = client.subscription;

		// Check if the client has subscribed to anything
		if (subscription === null)
			return false;

		return dataPoint.matchesSubscription(subscription);
	});
};

/**
 * Broadcasts the payload to all clients for which the callback returns true. 
 * The callback will receive two parameters, the payload and the client.
 * @param {type} payload
 * @param {type} cb (optional)
 * @returns {undefined}
 */
var broadcast = function(payload, cb) {
	for (var i in wss.clients)
	{
		var client = wss.clients[i];

		if (cb === undefined || cb(payload, client))
			client.send(JSON.stringify(payload));
	}
};
