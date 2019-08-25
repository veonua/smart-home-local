/**
 * poor adoptation of https://github.com/song940/node-mijia/blob/master/lib/packet.js to TS 
 */

import { createCipheriv, createHash, createDecipheriv } from "crypto";

const OFFSET = -1;  

export class Packet {
	public header: Buffer;
	private _token: Buffer | null;
	private _serverStampTime: number = 0;
	private _tokenKey: Buffer | null = null;
	private _tokenIV: Buffer | null = null;
	private lastResponse: number = 0;
	public data: Buffer|null = null;
	
	constructor() {
		this.header = Buffer.alloc(2 + 2 + 4 + 4 + 4 + 16);
		this.header[0] = 0x21;
		this.header[1] = 0x31;

		for(let i=4; i<32; i++) {
			this.header[i] = 0xff;
		}

		this._serverStampTime = 0;
		this._token = null;
	}

	debug (...args: any[]) {
		//console.log(...args);
	}

	handshake() {
		this.data = null;
	}

	handleHandshakeReply() {
		if(this._token === null) {
			const token = this.checksum;
			if(token.toString('hex').match(/^[fF0]+$/)) {
				// Device did not return its token so we set our token to null
				this._token = null;
			} else {
				this.token = this.checksum;
			}
		}
	}

	get needsHandshake() {
		/*
		 * Handshake if we:
		 * 1) do not have a token
		 * 2) it has been longer then 120 seconds since last received message
		 */
		return ! this._token || ( Date.now() - this.lastResponse ) > 120000;
	}

	public updateLast() {
		this.lastResponse = Date.now();
	}

	get raw() {
		if(this.data) {
			// Send a command to the device
			if(! this._token || !this._tokenKey) {
				throw new Error('Token is required to send commands');
			}

			for(let i=4; i<8; i++) {
				this.header[i] = 0x00;
			}

			this.header.writeUInt32BE(260426251, 8)

			// Update the stamp to match server
			// if (false && this._serverStampTime) {
			// 	const secondsPassed = (Date.now() - this._serverStampTime);
			// 	this.header.writeUInt32BE( Math.floor( (this._serverStampTime + secondsPassed)/1000), 12);
			// } else {
			this.header.writeUInt32BE(Math.floor(Date.now()/1000) + OFFSET, 12);
			// }

			// Encrypt the data
			let cipher = createCipheriv('aes-128-cbc', this._tokenKey, this._tokenIV);
			let encrypted = Buffer.concat([
				cipher.update(this.data),
				cipher.final()
			]);

			// Set the length
			this.header.writeUInt16BE(32 + encrypted.length, 2);

			// Calculate the checksum
			let digest = createHash('md5')
				.update(this.header.slice(0, 16))
				.update(this._token)
				.update(encrypted)
				.digest();
			digest.copy(this.header, 16);

			this.debug('->', this.header);
			return Buffer.concat([ this.header, encrypted ]);
		} else {
			// Handshake
			this.header.writeUInt16BE(32, 2);
			
			for(let i=4; i<32; i++) {
				this.header[i] = 0xff;
			}
			this.header.writeUInt32BE(Math.floor(Date.now()/1000) + OFFSET, 12);

			this.debug('->', this.header);
			return this.header;
		}
	}

	set raw(msg) {
		this.lastResponse = Date.now();
		msg.copy(this.header, 0, 0, 32);
		this.debug('<- ', this.header);

		const stamp = this.stamp;
		if(stamp > 0) {
			// If the device returned a stamp, store it
			//this._serverStamp = this.stamp;
			this._serverStampTime = Date.now();
		}

		const encrypted = msg.slice(32);

		if(encrypted.length == 0) {
			// Handshake packet, decrypt data
			this.handleHandshakeReply()
			this.data = null;
			return
		}

		// Normal packet, decrypt data
		if(! this._token || !this._tokenKey) {
			this.debug('<- No token set, unable to handle packet');
			this.data = null;
			return;
		}

		const digest = createHash('md5')
			.update(this.header.slice(0, 16))
			.update(this._token)
			.update(encrypted)
			.digest();

		const checksum = this.checksum;
		if(! checksum.equals(digest)) {
			this.debug('<- Invalid packet, checksum was', checksum, 'should be', digest);
			this.data = null;
		} else {
			let decipher = createDecipheriv('aes-128-cbc', this._tokenKey, this._tokenIV);
			this.data = Buffer.concat([
				decipher.update(encrypted),
				decipher.final()
			]);
		}
	}

	get token() {
		return this._token;
	}

	set token(t:Buffer|null) {
		if (t==null) return;

		this._token = Buffer.from(t);
		this._tokenKey = createHash('md5').update(t).digest();
		this._tokenIV = createHash('md5').update(this._tokenKey).update(t).digest();
	}

	get checksum() {
		return this.header.slice(16);
	}

	get deviceId() {
		return this.header.readUInt32BE(8);
	}

	get stamp() {
		return this.header.readUInt32BE(12);
	}
}