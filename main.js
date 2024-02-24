'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const dgram = require('dgram');
const http = require('http');


const {SerialPort} = require('serialport');
const vbus = require('resol-vbus');

const {
	Connection,
	TcpConnectionEndpoint,
} = vbus;

const serialformat = /^(COM|com)[0-9][0-9]?$|^\/dev\/tty.*$/;
const serialPorts = [];
const serialPortsTab =[];
const connections = [];
let logging = null;



class VbusGw extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'vbus-gw',
		});
		this.on('ready', this.onReady.bind(this));
		//this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info('Listen port: ' + this.config.port);
		this.log.info('Discovery port: ' + this.config.discoveryPort);

		for (const i in this.config.serialPortsTab) {
			if (this.config.serialPortsTab[i].path) {
				serialPortsTab.push(this.config.serialPortsTab[i]);
			}
		}
		this.log.debug(`serialPortsTab: ${JSON.stringify(serialPortsTab)}`);

		if (serialPortsTab.length === 0) {
			this.log.error(`No serial port configured - please check instance configuration of ${this.namespace}`);
			return;
		}

		for (const ports of serialPortsTab) {
			this.log.info('serial port path: ' + ports.path);
			this.log.info('serial port channel: ' + ports.channel);
			this.log.info('serial port baudrate: ' + ports.baudrate);

			if (!ports.path) {
				this.log.error(`Serial port id is empty - please check instance configuration of ${this.namespace}`);
				return;
			} else if (!ports.path.match(serialformat)) {
				this.log.error(`Serial port id format not valid. Should be e.g. COM5 or /dev/ttyUSBSerial`);
				return;
			}
		}
		this.main().then(null, err => {
			this.log.error(err);
			this.setState('info.connection', false, true);
		});
	}

	async main() {
		for (const serialPortConfig of serialPortsTab) {
			await this.openSerialPort(serialPortConfig);
		}
		logging = await this.createLogging();

		await this.createTcpEndpoint();

		await this.startDiscoveryServices();

		this.setState('info.connection', true, true);

		this.log.info('Waiting for connections...');

	}


	acceptConnection(serPort, connInfo) {
		const origin = connInfo.socket;
		const channel = +(connInfo.channel || '0');
		this.log.info(`Accepted connection with ${origin.remoteAddress.replace(/^.*:/, '')}`);

		connections.push({
			channel: serPort.channel,
			socket: origin,
		});

		function remove() {
			const idx = connections.indexOf(origin);
			if (idx >= 0) {
				connections.splice(idx, 1);
			}
		}

		origin.on('error', err => {
			this.log.error(err);

			remove();
		});

		origin.on('end', () => {
			this.log.info(`Closing connection to ${origin.remoteAddress.replace(/^.*:/, '')}`);

			remove();
		});

		origin.on('readable', () => {
			let chunk;
			while ((chunk = origin.read())) {
				if (serPort.channel === channel) serPort.port.write(chunk);
			}
		});
	}

	async createTcpEndpoint() {
		this.log.info('Opening TCP endpoint...');

		const channels = serialPorts.reduce((memo, serialPort) => {
			// @ts-ignore
			memo [serialPort.channel] = `VBus ${serialPort.channel}: ${serialPort.port.path}`;
			return memo;
		}, []);

		this.log.info ('Channels: ' + JSON.stringify(channels));

		const endpoint = new TcpConnectionEndpoint({
			port: this.config.port,
			password: this.config.vbusPassword,
			channels,
		});

		endpoint.on('connection', connectionInfo => {
			const channel = +(connectionInfo.channel || '0');
			const serialPort = serialPorts.find(port => port.channel === channel);

			this.log.debug(`Connection request from ${connectionInfo.socket.remoteAddress.replace(/^.*:/, '')}...`);

			if (serialPort) {
				this.log.info(`Negotiated connection with ${connectionInfo.socket.remoteAddress.replace(/^.*:/, '')} for channel ${channel}...`);
				this.log.debug(`Select serial port ${JSON.stringify(serialPort.port.path)}...`);
				this.acceptConnection(serialPort, connectionInfo);
			}
		});

		endpoint.on('connectionAttemptFailed', connection => {
			if (connection.error) {
				this.log.info(`Rejected connection with ${connection.ip.replace(/^.*:/, '')} due to ${connection.error}...`);
			}
		});

		await endpoint.start();
	}


	async openSerialPort(config) {
		this.log.info(`Opening serial port ${config.path}...`);

		const port = await new Promise((resolve, reject) => {
			const port = new SerialPort({
				path: config.path,
				baudRate: config.baudrate,
			}, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve(port);
				}
			});
		});

		port.on('error', err => {
			this.log.error(err);
			//process.exit(1);
		});

		port.on('end', () => {
			this.log.info('Serial port EOF');
			//process.exit(0);
		});

		port.on('readable', () => {
			let chunk;
			while ((chunk = port.read())) {
				for (const connection of connections) {
					if (connection.channel === config.channel) connection.socket.write(chunk);
				}

				if (logging) {
					logging.write(chunk);
				}
			}
		});

		serialPorts.push({
			channel: config.channel,
			port,
		});
	}


	async createLogging() {
		const connection = new Connection();

		connection.on('packet', _packet => {
			//this.log.debug (_packet.getId());
		});

		return connection;
	}


	async startDiscoveryServices() {
		this.log.info('Starting discovery web service...');

		const webReplyContent = [
			'vendor = "RESOL"',
			'product = "DL2"',
			'serial = "001E66000000"',
			'version = "2.1.0"',
			'build = "201311280853"',
			'name = "DL2-001E66000000"',
			'features = "vbus,dl2"',
		].join('\n');

		const webServer = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(webReplyContent);
		});

		webServer.on('clientError', (err, socket) => {
			this.log.error(err.message);
			socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
		});

		webServer.listen(this.config.discoveryPort);

		this.log.info('Starting discovery broadcast service...');

		const queryString = '---RESOL-BROADCAST-QUERY---';
		const replyBuffer = Buffer.from('---RESOL-BROADCAST-REPLY---', 'utf-8');

		const discoveryServer = dgram.createSocket('udp4');

		discoveryServer.on('error', err => {
			this.log.error(err.message);
		});

		discoveryServer.on('message', (msg, remote) => {
			this.log.debug('message' + msg + ' from ' + remote.address);

			const msgString = msg.toString('utf-8');
			if (msgString === queryString) {
				discoveryServer.send(replyBuffer, remote.port, remote.address);
			}
		});

		discoveryServer.bind(7053);
	}

	/**
 * Is called when adapter shuts down - callback has to be called under any circumstances!
 * @param {() => void} callback
 */
	onUnload(callback) {
		try {
		// Here you must clear all timeouts or intervals that may still be active
		// clearTimeout(timeout1);
		// clearTimeout(timeout2);
		// ...
		// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

}
if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new VbusGw(options);
} else {
	// otherwise start the instance directly
	new VbusGw();
}