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

//const config = require('./config');



const {
	Connection,
	TcpConnectionEndpoint,
} = vbus;

const serialformat = /^(COM|com)[0-9][0-9]?$|^\/dev\/tty.*$/;
const serialPorts = [];
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
		this.log.info('config port: ' + this.config.port);
		this.log.info('config path: ' + this.config.serialPorts[0].path);
		this.log.info('config channel: ' + this.config.serialPorts[0].channel);
		this.log.info('config baudrate: ' + this.config.serialPorts[0].baudrate);

		if (!this.config.serialPorts[0].path) {
			this.log.error(`Serial port id is empty - please check instance configuration of ${this.namespace}`);
			return;
		} else if (!this.config.serialPorts[0].path.match(serialformat)) {
			this.log.error(`Serial port id format not valid. Should be e.g. COM5 or /dev/ttyUSBSerial`);
			return;
		}


		for (const serialPortConfig of this.config.serialPorts) {
			try {
				await this.openSerialPort(serialPortConfig);
				this.setState('info.connection', true, true);
			}
			catch (err) {
				this.log.error(err);
				return;
			}
		}

		logging = await this.createLogging();

		await this.createTcpEndpoint();

		await this.startDiscoveryServices();

		this.log.info('Waiting for connections...');

	}

	/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
	/*
		await this.setObjectNotExistsAsync('testVariable', {
			type: 'state',
			common: {
				name: 'testVariable',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: true,
			},
			native: {},
		});
		*/
	// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
	// this.subscribeStates('testVariable');
	// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
	// this.subscribeStates('lights.*');
	// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
	// this.subscribeStates('*');

	/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
	// the variable testVariable is set to true as command (ack=false)
	//await this.setStateAsync('testVariable', true);

	// same thing, but the value is flagged "ack"
	// ack should be always set to true if the value is received from or acknowledged from the target system
	//await this.setStateAsync('testVariable', { val: true, ack: true });

	// same thing, but the state is deleted after 30s (getState will return null afterwards)
	//await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

	// examples for the checkPassword/checkGroup functions
	/*
		let result = await this.checkPasswordAsync('admin', 'iobroker');
		this.log.info('check user admin pw iobroker: ' + result);

		result = await this.checkGroupAsync('admin', 'admin');
		this.log.info('check group user admin group admin: ' + result);
		*/

	//errorLog(args) {
	//	this.log.error(args);
	//}


	//debugLog(args) {
	//	this.log.debug(args);
	//}


	acceptConnection(port, origin) {
		this.log.info('Accepting connection');

		connections.push(origin);

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
			this.log.info('Closing connection');

			remove();
		});

		origin.on('readable', () => {
			let chunk;
			while ((chunk = origin.read())) {
				port.write(chunk);
			}
		});
	}

	async createTcpEndpoint() {
		this.log.info('Opening TCP endpoint...');

		const channels = this.config.serialPorts.reduce((memo, serialPort) => {
			// @ts-ignore
			memo [serialPort.channel] = `VBus ${serialPort.channel}: ${serialPort.path}`;
			return memo;
		}, []);

		this.log.info ('Channels: ' + JSON.stringify(channels));

		const endpoint = new TcpConnectionEndpoint({
			port: this.config.port,
			channels,
		});

		endpoint.on('connection', connectionInfo => {
			const channel = +(connectionInfo.channel || '0');
			const serialPort = serialPorts.find(port => port.channel === channel);

			if (serialPort) {
				this.log.info(`Negotiated connection for channel ${channel}...`);
				this.acceptConnection(serialPort.port, connectionInfo.socket);
			} else {
				this.log.info(`Rejecting connection for unknown channel ${channel}...`);
				connectionInfo.socket.end();
			}
		});

		await endpoint.start();
	}


	async openSerialPort(config) {
		this.log.info('Opening serial port...');

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
					connection.write(chunk);
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
			// this.log.debug (_packet.getId());
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

		webServer.listen(3000);

		this.log.info('Starting discovery broadcast service...');

		const queryString = '---RESOL-BROADCAST-QUERY---';
		const replyBuffer = Buffer.from('---RESOL-BROADCAST-REPLY---', 'utf-8');

		const discoveryServer = dgram.createSocket('udp4');

		discoveryServer.on('error', err => {
			this.log.error(err.message);
		});

		discoveryServer.on('message', (msg, remote) => {
			this.log.debug('message' + msg + ' ' + remote);

			const msgString = msg.toString('utf-8');
			if (msgString === queryString) {
				discoveryServer.send(replyBuffer, remote.port, remote.address);
			}
		});

		discoveryServer.bind(7053);
	}


	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	/*
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}
	*/

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }



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