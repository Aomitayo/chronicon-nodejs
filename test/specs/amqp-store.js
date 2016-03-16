var chai = require('chai');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var amqplib = require('amqplib');
var Chronicon = require('../..');
var expect = chai.expect;
chai.use(sinonChai);

var _ = require('lodash');
var async = require('async');

var amqpUrl = process.env.AMQP_URL;

describe('AMQP Store', function(){
	before(function(){
		var ctx = this;
		ctx.exchange = 'chronicon-test';
		ctx.chronicon  = new Chronicon('amqp', {
			connection: amqpUrl,
			exchange: ctx.exchange
		});
	});
	
	before(function(done){
		var ctx = this;

		amqplib.connect(amqpUrl)
		.then(function(conn){
			ctx.connection = conn;
			return conn.createConfirmChannel();
		})
		.then(function(ch){
			ctx.channel = ch;
			return ch.assertExchange(ctx.exchange, 'topic', {durable:false});
		})
		.then(function(){
			done();
		});
	});

	after(function(){
		var ctx = this;
		if(ctx.connection){
			ctx.connection.close();
		}
	});

	describe('#read', function(){
		before(function(){
			var ctx = this;
			ctx.topic = 'chronicon.test.read';
			ctx.stream = ctx.chronicon.read(ctx.topic);
			ctx.streamSpy = sinon.spy();
			ctx.stream.on('data', ctx.streamSpy);
		});

		beforeEach(function(){
			var ctx = this;
			ctx.streamSpy.reset();
		});

		it('Returns a readable stream', function(){
			var ctx = this;
			expect(ctx.stream).to.be.an.instanceOf(require('stream').Readable);
		});

		it('Stream does not emit any data when nothing is published', function(done){
			var ctx = this;
			setTimeout(function(){
				expect(ctx.streamSpy).to.not.have.been.called;
				done();
			}, 1000);
		});

		it('Stream reads as many entries as are published on topic', function(done){
			var ctx = this;

			async.times(_.random(1, 10), function(n, next){
				var payload = {
					sequenceNumber: n,
					testAttr: 'test'
				};
				ctx.channel.publish(ctx.exchange, ctx.topic, new Buffer(JSON.stringify(payload)), {}, function(err){
					if(err){
						next(err);
					}
					else{
						next(null, payload);
					}
				});
				
			}, function(err, results){
				if(err){
					return done(err);
				}
				//Wait 2 seconds then perform the checks
				setTimeout(function(){
					expect(ctx.streamSpy).to.have.been.called;
					(results || []).forEach(function(payload, index){
						expect(ctx.streamSpy.args[index][0]).to.have.property('sequenceNumber', index);
						expect(ctx.streamSpy.args[index][0]).to.have.property('testAttr', 'test');
					});
					done();
				}, 2000);
			});
		});

		it('Stream does not emit any data when entry is published on another topic', function(done){
			var ctx = this;

			async.times(_.random(1, 10), function(n, next){
				var payload = {
					sequenceNumber: n,
					testAttr: 'test'
				};
				ctx.channel.publish(ctx.exchange, ctx.topic +'.not', new Buffer(JSON.stringify(payload)), {}, function(err){
					if(err){
						next(err);
					}
					else{
						next(null, payload);
					}
				});
				
			}, function(err){
				if(err){
					return done(err);
				}
				//Wait 2 seconds then perform the checks
				setTimeout(function(){
					expect(ctx.streamSpy).to.not.have.been.called;
					done();
				}, 2000);
			});
		});
	});

	describe('#writable', function(){
		before(function(done){
			var ctx = this;
			ctx.topic = 'chronicon.test.write';
			ctx.stream = ctx.chronicon.writable(ctx.topic);
			ctx.amqpSpy = sinon.spy(function(msg){
				ctx.channel.ack(msg);
			});
			ctx.channel.assertQueue('', {exclusive:true})
			.then(function(q){
				ctx.queue = q.queue;
				return ctx.channel.bindQueue(ctx.queue, ctx.exchange, ctx.topic);
			})
			.then(function(){
				ctx.channel.consume(ctx.queue, ctx.amqpSpy);
				done();
			})
			.catch(function(err){
				done(err);
			})
			.done();
		});

		beforeEach(function(){
			var ctx = this;
			ctx.amqpSpy.reset();
		});

		it('Returns a writable stream', function(){
			var ctx = this;
			expect(ctx.stream).to.be.instanceOf(require('stream').Writable);
		});

		it('Message broker does not publish any message when nothing is written to stream', function(done){
			var ctx = this;
			setTimeout(function(){
				expect(ctx.amqpSpy).to.not.have.been.called;
				done();
			}, 1000);
		});

		it('Broker publishes as many messages as are written to stream', function(done){
			var ctx = this;
			var numEntries = _.random(1, 10);
			async.times(numEntries, function(n, next){
				var payload = {
					sequenceNumber: n,
					testAttr: 'test'
				};
				ctx.stream.write(payload, next);
				
			}, function(err, results){
				if(err){
					return done(err);
				}
				//Wait 2 seconds then perform the checks
				setTimeout(function(){
					expect(ctx.amqpSpy).to.have.callCount(numEntries);
					(results || []).forEach(function(payload, index){
						var message = JSON.parse(ctx.amqpSpy.args[index][0].content);
						expect(message).to.have.property('sequenceNumber', index);
						expect(message).to.have.property('testAttr', 'test');
					});
					done();
				}, 2000);
			});
		});
	});
});
