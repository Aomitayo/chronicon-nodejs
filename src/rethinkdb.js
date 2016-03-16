/* jshint latedef:false */
'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Readable = require('stream').Readable;
var Writable = require('stream').Writable;
var amqplib = require('amqplib');

module.exports = RethinkdbStore;


