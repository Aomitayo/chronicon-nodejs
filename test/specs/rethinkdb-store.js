var chai = require('chai');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var r = require('rethinkdb');
var Chronicon = require('../..');
var expect = chai.expect;
chai.use(sinonChai);

var url = require('url');
var _ = require('lodash');
var async = require('async');

var rethinkdbUrl = process.env.RETHINKDB_URL;

function tableName(topic){
	return (topic || '').replace(/\./g, '_');
}

describe('Rethinkdb Store', function(){
	before(function(done){
		var ctx = this;
		var urlParts = url.parse(rethinkdbUrl);
		ctx.rethinkdbOptions = _.extend({
			db: (urlParts.pathname || '').replace(/^\//, '') || 'chronicon_test',
			url: rethinkdbUrl
		}, {
			host: urlParts.hostname,
			port: urlParts.port,
		});
		ctx.chronicon  = new Chronicon('rethinkdb', ctx.rethinkdbOptions);
		if(ctx.chronicon.isReady){
			done();
		}
		else{
			ctx.chronicon.on('ready', function(){
				done();
			});
		}
	});
	
	before(function(done){
		var ctx = this;
		r.connect(ctx.rethinkdbOptions)
		.then(function(conn){
			ctx.connection = conn;
		})
		.then(function(){
			return r.dbCreate(ctx.rethinkdbOptions.db).run(ctx.connection)
				.catch(function(){
					return;
				});
		})
		.then(function(){
			return r.tableCreate(tableName(ctx.topic)).run(ctx.connection)
				.catch(function(){return;});
		})
		.then(function(){
			return done();
		})
		.catch(function(err){
			return done(err);
		});
	});
	
	after(function(done){
		var ctx = this;
		if(ctx.connection){
			ctx.connection.close(done);
		}
	});

	describe('#read', function(){
		before(function(){
			var ctx = this;
			ctx.topic = 'chronicon.test.read';
			ctx.topicWrong = 'chronicon.test.read.not';
		});

		before(function(done){
			var ctx = this;
			r.tableCreate(tableName(ctx.topic)).run(ctx.connection)
				.catch(function(){return;})
				.finally(function(){
					return r.tableCreate(tableName(ctx.topicWrong)).run(ctx.connection);
				})
				.catch(function(){return;})
				.finally(done)
				.done();
		});

		before(function(){
			var ctx = this;
			ctx.stream = ctx.chronicon.read(ctx.topic);
			ctx.streamSpy = sinon.spy();
			ctx.stream.on('data', ctx.streamSpy);
		});
		
		beforeEach(function(done){
			var ctx = this;
			r.table(tableName(ctx.topic)).delete().run(ctx.connection, done);
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
			var numEntries = _.random(1, 10);
			async.timesSeries(numEntries, function(n, next){
				var payload = {
					sequenceNumber: n,
					testAttr: 'test'
				};

				r.table(tableName(ctx.topic)).insert(payload).run(ctx.connection, function(err){
					setTimeout(function(){
						next(err, payload);
					}, 100);
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
				},100);
			});
		});

		it('Stream does not emit any data when entry is published on another topic', function(done){
			var ctx = this;

			async.timesSeries(_.random(1, 10), function(n, next){
				var payload = {
					sequenceNumber: n,
					testAttr: 'test'
				};

				r.table(tableName(ctx.topic + '.not')).insert(payload).run(ctx.connection, function(err){
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
		before(function(){
			var ctx = this;
			ctx.topic = 'chronicon.test.write';
			ctx.topicWrong = 'chronicon.test.write.not';
		});

		before(function(done){
			var ctx = this;
			r.tableCreate(tableName(ctx.topic)).run(ctx.connection)
				.catch(function(){return;})
				.finally(function(){
					return r.tableCreate(tableName(ctx.topicWrong)).run(ctx.connection);
				})
				.catch(function(){return;})
				.finally(done)
				.done();
		});

		before(function(done){
			var ctx = this;
			ctx.stream = ctx.chronicon.writable(ctx.topic);
			ctx.changeSpy = sinon.spy();
			//r.table(tableName(ctx.topic)).changes().filter(r.row('old_val').eq(null)).run(ctx.connection, function(err, cursor){
			r.table(tableName(ctx.topic)).changes().run(ctx.connection, function(err, cursor){
				if(err){return done(err);}
				ctx.changeCursor = cursor;
				cursor.each(function(err, c){
					/* jshint camelcase:false */
					if(!err && c.old_val === null){
						ctx.changeSpy(c.new_val);
					}
				});
				done();
			});
		});
		
		beforeEach(function(done){
			var ctx = this;
			r.table(tableName(ctx.topic)).delete().run(ctx.connection, done);
		});

		beforeEach(function(){
			var ctx = this;
			ctx.changeSpy.reset();
		});

		it('Returns a writable stream', function(){
			var ctx = this;
			expect(ctx.stream).to.be.instanceOf(require('stream').Writable);
		});

		it('Message broker does not publish any message when nothing is written to stream', function(done){
			var ctx = this;
			setTimeout(function(){
				expect(ctx.changeSpy).to.not.have.been.called;
				done();
			}, 1000);
		});

		it('Broker publishes as many messages as are written to stream', function(done){
			var ctx = this;
			var numEntries = _.random(1, 10);
			async.timesSeries(numEntries, function(n, next){
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
					expect(ctx.changeSpy).to.have.callCount(numEntries);
					(results || []).forEach(function(payload, index){
						var message = ctx.changeSpy.args[index][0];
						expect(message).to.have.property('sequenceNumber', index);
						expect(message).to.have.property('testAttr', 'test');
					});
					done();
				}, 2000);
			});
		});
	});
});
