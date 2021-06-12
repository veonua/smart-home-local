import { IDeviceState, IRoboVacuumCommand, IRoboVacuumResponse } from "./types"
import { Packet } from "./packet";

export abstract class IMiDevice<C> {
    initialized: boolean = false
    onInit(result: smarthome.DataFlow.UdpResponseData) {
        this.onResponse("action.devices.QUERY", undefined, result)
    }
    
    type: string;
    get needsHandshake() { return this.packet.needsHandshake };
	packet: Packet;
    deviceId: number;
    deviceIdString: string;
	token: string;

	abstract convertImpl(command: string, params: C|undefined) : IRoboVacuumCommand
	abstract onResponseImpl(command: string, params: C|undefined, resp_result: any[]): IDeviceState

	constructor(type:string, deviceId:number, token:string) {
        this.type = type
        this.token = token
        this.deviceId = deviceId
        this.deviceIdString = deviceId.toString()
		this.packet = new Packet(deviceId) // token
	}

	decode(value: string[]|undefined): IRoboVacuumResponse | null {
		if (!value)
			return null;
		
		var p = this.packet.clone(); //new Packet(this.deviceId);
		p.raw = Buffer.from(value[0], "hex");
		if (p.data==null) return null;
		var data_str = p.data.toString()
		data_str = data_str.substring(0, data_str.lastIndexOf("}")+1);
		console.log("response (json) ", data_str);
		return JSON.parse(data_str);
    }

    onResponse(command: string, params: C|undefined, result: smarthome.DataFlow.UdpResponseData) : IDeviceState {
		this.packet.updateLast(); 
		var resp = this.decode(result.udpResponse.responsePackets)
        if (resp==null) {return {};}
        this.initialized = true

        if (resp.error) {
			return {
                error: resp.error
            }
        }
        
		var resp_result = resp.result
		return this.onResponseImpl(command, params, resp_result)
	}

    convert(command: string, params: C|undefined) {
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
        const handshakeCommand = new smarthome.DataFlow.UdpRequestData();
        handshakeCommand.requestId = requestId;
        handshakeCommand.deviceId = this.deviceIdString;
        handshakeCommand.port = portNumber;
        handshakeCommand.data = "21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        handshakeCommand.expectedResponsePackets = 1;
        return handshakeCommand
    }
}