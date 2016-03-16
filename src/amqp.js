/* jshint latedef:false */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Readable = require('stream').Readable;
var Writable = require('stream').Writable;
var amqplib = require('amqplib');

module.exports = AmqpStore;

function AmqpStore(options){
	if(!(this instanceof AmqpStore)){
		return new AmqpStore(exchange, connection);
	}
	this.options = options || {};
	var exchange = options.exchange;
	var connection = options.connection;
	this.exchange = exchange || 'amqpstream';
	this.connectionPromise = typeof connection === 'string'? this.connect(connection) : connection;

	var self = this;

	self.connectionPromise
	.then(function(conn){
		self.connection = conn;
		return conn.createConfirmChannel();
	})
	.then(function(ch){
		self.channel = ch;
		return ch.assertExchange(self.exchange, 'topic', {durable:false});
	})
	.then(function(){
		self._isReady = true;
		self.emit('ready');
	})
	.catch(function(err){
		throw err;
	}).done();
}

util.inherits(AmqpStore, EventEmitter);

AmqpStore.prototype.connect = function(amqpUrl){
	return amqplib.connect(amqpUrl);
};

AmqpStore.prototype.read = function(topics){
	var self = this;

	if(!topics){
		throw new Error('Topics must be selected');
	}
	topics = Array.isArray(topics)? topics : [topics];

	var stream = new Readable({objectMode:true});
	stream._read = function(){
		if(!stream._isReading){
			startReading();
		}
	};

	function startReading(){
		if(!self._isReady){
			return self.once('ready', startReading);
		}
		
		stream._isReading = true;
		self.channel.assertQueue('', {exclusive:true})
			.then(function(q){
				stream._amqpQueue = q.queue;
				return topics.reduce(function(a, v){
					if(a){
						return a.then(function(){
							self.channel.bindQueue(stream._amqpQueue, self.exchange, v);
						});
					}
					else{
						return self.channel.bindQueue(stream._amqpQueue, self.exchange, v);
					}
				}, null);
			})
			.then(function(){
				self.channel.consume(stream._amqpQueue, function(msg){
					stream.push(JSON.parse(msg.content));
					//stream.push({
					//	topic: msg.fields.routingKey,
					//	payload: JSON.parse(msg.content)
					//});
					self.channel.ack(msg);
				});
			})
			.catch(function(err){
				stream.emit('error', err);
			})
			.done();
	}
	return stream;
};

AmqpStore.prototype.writable = function(topic){
	var self = this;

	var stream = new Writable({objectMode:true});
	stream._write = function(payload, encoding, callback){
		doWrite(payload, encoding, callback);
	};

	function doWrite (payload, encoding, callback){
		if(!self._isReady){
			return self.once('ready', doWrite.bind(null, payload, encoding, callback));
		}

		self.channel.publish(self.exchange, topic, new Buffer(JSON.stringify(payload)), {}, function(err){
			callback(err);
		});
	}
	return stream;
};

AmqpStore.prototype.write = function(topic, payload){
	var self = this;
	self.writable(topic).end(payload);
};
