/* jshint latedef:false */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var stores = {
	'amqp': require('./amqp-store'),
	'rethinkdb': require('./rethinkdb-store')
};

module.exports = Chronicon;

function Chronicon(type, options){
	if(!(this instanceof Chronicon)){
		return new Chronicon(type, options);
	}

	if(type){
		this.connect.apply(this, arguments);
	}
}

util.inherits(Chronicon, EventEmitter);

Chronicon.prototype.connect = function(type, options){
	var self = this;

	self.options = options || {};
	self.type = type;
	var Store  = stores[type];

	if(!Store){
		throw new Error( type + ' is not a recognized backend');
	}

	self.store = new Store(options);
	self.store.on('ready', function(){
		self.isReady = true;
		self.emit('ready');
	});

	//self.store.connect.apply(self.store, Array.prototype.slice.call(arguments, 1));
};

Chronicon.prototype.read = function(topic){
	return this.store.read.apply(this.store, arguments);
};

Chronicon.prototype.writable = function(topic){
	return this.store.writable(topic);
};

Chronicon.prototype.write = function(topic, payload){
	return this.writable(topic).end(payload);
};

