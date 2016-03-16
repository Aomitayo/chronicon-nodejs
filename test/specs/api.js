var expect = require('chai').expect;
var Chronicon = require('../../');

describe('Chronicon API', function(){
	it('Responds to a connect method', function(){
		expect(Chronicon()).to.respondTo('connect');
	});

	it('Responds to read method', function(){
		expect(Chronicon()).to.respondTo('read');
	});

	it('Should respond to writable', function(){
		expect(Chronicon()).to.respondTo('writable');
	});

	it('Should respond to write', function(){
		expect(Chronicon()).to.respondTo('write');
	});

});
