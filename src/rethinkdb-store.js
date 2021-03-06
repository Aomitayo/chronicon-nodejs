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
	self._confirmedTopics = {};

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
			return r.dbList().contains(options.db).run(self.connection);
		})
		.then(function(dbExists){
			if(!dbExists){
				return r.dbCreate(options.db).run(self.connection)
					.catch(function(){});
			}
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
		stream._isReading = true;
		if(!self._isReady){
			return self.once('ready', startReading);
		}
		if(!self.isTopicConfirmed(topic)){
			self.once('confirmed_topic_'+ topic, startReading.bind(null));
			self.confirmTopic(topic, stream);
			return;
		}

		r.table(RethinkdbStore.tableName(topic)).changes().run(self.connection, function(err, cursor){
			if(err){
				return stream.emit('error', err);
			}

			cursor.each(function(err, c){
				if(err){
					return stream.emit('error', err);
				}
				/* jshint camelcase:false */
				if(!c.old_val){
					stream.push(c.new_val);
				}
			});
		});		
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
		if(!self.isTopicConfirmed(topic)){
			self.once('confirmed_topic_'+ topic, doWrite.bind(null, payload, encoding, callback));
			self.confirmTopic(topic, stream);
			return;
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

RethinkdbStore.prototype.isTopicConfirmed = function(topic){
	return !! this._confirmedTopics[topic];
};

RethinkdbStore.prototype.confirmTopic = function(topic, emitter, cb){
	var self = this;
	var tableName = RethinkdbStore.tableName(topic);
	if(!cb && typeof emitter === 'function'){
		cb = emitter;
		emitter = null;
	}

	return r.tableCreate(tableName).run(self.connection)
	.catch(function(){})
	.finally(function(){
		self._confirmedTopics[topic] = topic;
		self.emit('confirmed_topic', topic);
		self.emit('confirmed_topic_'+ topic, topic);
		if(emitter){
			emitter.emit('confirmed_topic', topic);
			emitter.emit('confirmed_topic_'+ topic, topic);
		}
		cb = cb || function(){};
		cb();
	})
	.done();
};

RethinkdbStore.tableName = function(topic){
	return (topic || '').replace(/\./g, '_');
};
