/* jshint latedef:false */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Readable = require('stream').Readable;
var Writable = require('stream').Writable;
var r = require('rethinkdb');

module.exports = RethinkdbStore;

function RethinkdbStore(options){
	if(!(this instanceof RethinkdbStore)){
		return new RethinkdbStore(options);
	}
	var self = this;
	self.options = options || {};
	if(options){
		self.connect(options);
	}

}

util.inherits(RethinkdbStore, EventEmitter);

RethinkdbStore.prototype.connect = function(options){
	var self = this;
	if(typeof options.connection === 'object'){
		self.connection = options.connection;
		self._isReady = true;
	}
	else{
		r.connect(options)
		.then(function(conn){
			self.connection = conn;
		})
		.then(function(){
			self._isReady = true;
			self.emit('ready');
		})
		.catch(function(err){
			throw err;
		}).done();
	}
	return self;
};

RethinkdbStore.prototype.read = function(topic){
	var self = this;

	if(!topic){
		throw new Error('A topic must be selected');
	}

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

		r.table(RethinkdbStore.tableName(topic)).changes().run(self.connection, function(err, cursor){
			if(err){
				return stream.emit('error', err);
			}

			cursor.each(function(err, c){
				if(err){
					return stream.emit('error');
				}
				/* jshint camelcase:false */
				if(!c.old_val){
					stream.push(c.new_val);
				}
			});
		});		
		stream._isReading = true;
	}
	return stream;
};

RethinkdbStore.prototype.writable = function(topic){
	var self = this;

	var stream = new Writable({objectMode:true});
	stream._write = function(payload, encoding, callback){
		doWrite(payload, encoding, callback);
	};

	function doWrite (payload, encoding, callback){
		if(!self._isReady){
			return self.once('ready', doWrite.bind(null, payload, encoding, callback));
		}
		r.table(RethinkdbStore.tableName(topic)).insert(payload).run(self.connection, function(err){
			callback(err);
		});
	}
	return stream;
};

RethinkdbStore.prototype.write = function(topic, payload){
	var self = this;
	self.writable(topic).end(payload);
};

RethinkdbStore.tableName = function(topic){
	return (topic || '').replace(/\./g, '_');
};
