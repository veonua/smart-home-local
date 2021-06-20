/**
 * poor adoptation of https://github.com/song940/node-mijia/blob/master/lib/packet.js to TS 
 */

import { createHash, Cipher, createCipheriv, Decipher, createDecipheriv } from "crypto";
import { IMiCommand, IMiResponse } from "./types"

const OFFSET = 2;  

export class UnexpectedInputPacket extends Error {
}


export class Packet {
	private token: Buffer;
	private deviceId: number;
	private lastResponse: number = 0; // seconds
	private msgCounter = 1;
	private _stampDelta: number = 0;
	private _tokenKey:Buffer
	private _tokenIV:Buffer
	handshake = "21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
	
	
	constructor(deviceId:number, token:string) {
		this.token = Buffer.from(token, "hex");
		this._tokenKey = createHash('md5').update(this.token).digest();
		this._tokenIV = createHash('md5').update(this._tokenKey).update(this.token).digest();
    	this.deviceId = deviceId;
	}

	_build_miio(data:Buffer, ts:number):Buffer {
        let header = Buffer.alloc(16)
        length = 0
        
		let cipher = createCipheriv('aes-128-cbc', this._tokenKey, this._tokenIV)
		
        let encrypted = Buffer.concat([
            cipher.update(data),
			cipher.update(Buffer.from("00",'hex')),
            cipher.final()
        ]);

        header.writeUInt16BE(0x2131,0)
        header.writeUInt16BE(32 + encrypted.length, 2);
        header.writeUInt32BE(0, 4)
        header.writeUInt32BE(this.deviceId, 8)
        header.writeUInt32BE(ts, 12)

        let digest = createHash('md5')
            .update(header)
            .update(this.token)
            .update(encrypted)
            .digest();

        return Buffer.concat([header, digest, encrypted]);
    }

	public encode(val: IMiCommand):Buffer {
		let micom = { ...{id:this.msgCounter}, ...val }
		this.msgCounter ++

        const jrequest = JSON.stringify(micom).replace('"method":{"', '"').replace(']"}}', ']"}').replace('"},"', '","');
        const buffer = Buffer.from(jrequest, 'utf8')
        let send_ts = Math.ceil(Date.now()/1000) + this._stampDelta + OFFSET

        return this._build_miio(buffer, send_ts)
	}

	public decode(value: string[]|undefined) : IMiResponse {
		if (!value || value?.length!=1)
            throw new UnexpectedInputPacket("empty packet, check token and signatures");
		
		const msg = Buffer.from(value[0], 'hex')
		this.lastResponse = Math.floor(Date.now()/1000)
		const mi_ts =  msg.readUInt32BE(12);
		this._stampDelta = mi_ts - this.lastResponse
		//console.log("mi - google time delta "+ (this._stampDelta)+ "s")
	
		const encrypted = msg.slice(32);
	
		if (encrypted.length == 0) { // Handshake packet
			return {
				id: 0,
				result: ['']
			}
		}
	
		const digest = createHash('md5')
			.update(msg.slice(0, 16))
			.update(this.token)
			.update(encrypted)
			.digest();

		const checksum = msg.slice(16, 32)
		if(! checksum.equals(digest)) {
			throw Error("invalid check sum")
		}
		let decipher = createDecipheriv('aes-128-cbc', this._tokenKey, this._tokenIV); 
		//decipher.setAutoPadding(false);
		let data = Buffer.concat([
			decipher.update(encrypted),
			decipher.final()
		]);
		
		if (data == null) {
            throw new UnexpectedInputPacket("can't decode packet, reset session");
        }
		var data_str = data.toString()
		data_str = data_str.substring(0, data_str.lastIndexOf("}")+1);
		console.log("decoded response ", data_str);
		return JSON.parse(data_str);
	}


	get needsHandshake() {
		/*
		 * Handshake if we:
		 * 1) do not have a token
		 * 2) it has been longer then 10 mins since last received message
		 */
		return ! this.token || ( Date.now()/1000 - this.lastResponse ) > 10 * 60;
	}
}