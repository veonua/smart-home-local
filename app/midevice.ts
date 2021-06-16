import { IDeviceState, IErrorState, IRoboVacuumCommand, IDeviceResponse, ISuccessState } from "./types"
import { Packet } from "./packet";

export class UnexpectedInputPacket extends Error {
}

export abstract class IMiDevice<Command, State extends ISuccessState> {
    initialized: boolean = false
    error_codes: { [id: number]: string; } = {};
    
    type: string;
    get needsHandshake() { return this.packet.needsHandshake };
	packet: Packet;
    deviceId: number;
    deviceIdString: string;
	token: string;
    lastQueryResponse: number = 0;
    cachedQueryResponse: State|null = null;

    get cachedQuery() { 
        if (( Date.now() - this.lastQueryResponse ) > 30000) { return null;}
        return this.cachedQueryResponse 
    }

	abstract convertImpl(command: string, params: Command|undefined) : IRoboVacuumCommand
	abstract onResponseImpl(command: string, params: Command|undefined, resp_result: any[]): State

	constructor(type:string, deviceId:number, token:string) {
        this.type = type
        this.token = token
        this.deviceId = deviceId
        this.deviceIdString = deviceId.toString()
		this.packet = new Packet(deviceId) // token
	}

	decode(value: string[]|undefined): IDeviceResponse {
		if (!value)
            throw new UnexpectedInputPacket("empty packet");
		
		var p = this.packet.clone(); //new Packet(this.deviceId);
		p.raw = Buffer.from(value[0], "hex");
		if (p.data==null) {
            //console.warn("can't decode packet, reset session");
            this.packet.token = null;
            throw new UnexpectedInputPacket("can't decode packet, reset session");
        }
		var data_str = p.data.toString()
		data_str = data_str.substring(0, data_str.lastIndexOf("}")+1);
		console.log("decoded response ", data_str);
		return JSON.parse(data_str);
    }

    onResponse(command: string, params: Command|undefined, result: smarthome.DataFlow.UdpResponseData) : IDeviceState {
		this.packet.updateLast();
        try {
            var resp = this.decode(result.udpResponse.responsePackets)
        } catch (e) {
            console.error("decode UPD", e)
            return {
                errorCode: "networkJammingDetected"
            } as IErrorState

        }
        
        if (resp.error) {
            return {
                errorCode: this.error_codes[resp.error.code]
            } as IErrorState
        }

        this.initialized = true

        
        const res = this.onResponseImpl(command, params, resp.result)
        if (command == smarthome.Intents.QUERY) {
            if (res.status == "SUCCESS") {
                this.lastQueryResponse = Date.now();
                this.cachedQueryResponse = res
            }
        } else {
            this.cachedQueryResponse = null
        }
        return res
	}

    convert(command: string, params: Command|undefined) {
        let micom = { ...{id:this.packet.msgCounter}, ...this.convertImpl(command, params) }

        const s = JSON.stringify(micom).replace('"method":{"', '"').replace(']"}}', ']"}').replace('"},"', '","');
        this.packet.data = Buffer.from(s, 'utf8');
        this.packet.msgCounter ++

		return this.packet.raw
    }

    onHandshake(response: string) { //  | number[]
        //const device_hex = ("00000000" + this.deviceId.toString(16)).substr(-8);
        let resp = response.substring(0, response.length-this.token.length) + this.token
        this.packet.raw = Buffer.from(resp, "hex");
    }

    makeHandshakeCommand(requestId: string, portNumber: number): smarthome.DataFlow.CommandRequest {
        console.debug("sending hanshake...");
        const handshakeCommand = new smarthome.DataFlow.UdpRequestData();
        handshakeCommand.requestId = requestId;
        handshakeCommand.deviceId = this.deviceIdString;
        handshakeCommand.port = portNumber;
        handshakeCommand.data = "21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        handshakeCommand.expectedResponsePackets = 1;
        return handshakeCommand
    }
}