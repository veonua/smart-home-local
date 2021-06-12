import { IAcCommand, IDeviceState, IOnOff, IFanSpeed, IThermostatTemperatureSetpoint, IThermostatMode} from "./types"
import { IMiDevice } from "./midevice";


interface IVolatileAC {
	targetTemp?: number;
	led?: boolean;
	power?: boolean;
	opMode?: number;
	fanSpeed?: number;
	swingMode?: number;
}

export class AcPartnerDevice extends IMiDevice<IAcCommand> {
	state?: Buffer;
	load_power: number = 0;
	model?: { raw: Buffer; 
		airConFormat: number; 
		airConType: number; 
		airConBrand: number; 
		airConRemote: number; 
		airConState: number; };
	targetTemp: number = 0;
	led: boolean = false;
	power: boolean = false;
	opMode: number = 0;
	fanSpeed: number = 0;
	swingMode: number = 0;
	prefix: any;
	suffix: any;
	
	opModeString() {
		switch (this.opMode) {
			case 0: 
				return 'heat';
			case 1:
				return 'cool';
			case 2:
				return 'auto';
			case 3:
				return 'dry';
			case 4:
				return 'wind';    
			};
	}
	
	fanSpeedString() {
		switch (this.fanSpeed) {
			case 0:
				return 'low';
			case 1:
				return 'medium';
			case 2:
				return 'high';
			case 3:
				return 'auto';                
			};
	}

	swingModeString() {
		switch (this.swingMode) {
			case 0:
				return 'on';
			case 1:
				return 'off';
			case 2:
				return 'unknown2';
			case 7:
				return 'unknown7';
			case 13:
				return 'chigoon';
			case 14:
				return 'chigooff';
		}
	}

	constructor(deviceId:number, token:string, customData : any) {
		super("action.devices.types.AC_UNIT", deviceId, token)
	}
	
	onResponseImpl(command: string, params: IAcCommand, resp_result: any): IDeviceState {
		switch (command) {
			case "action.devices.QUERY" :
				this.parseStatus(resp_result)
				break
		}

		return {
			online: true,
			on: this.power,
			currentFanSpeedSetting: this.fanSpeedString(),
			thermostatMode: this.opModeString(),
			thermostatTemperatureSetpoint: this.targetTemp
		};
	}
	
	parseStatus(data: any[]) {
		// ["010500220001186701","011130190100011867","0"]
		let model = Buffer.from(data[0], "hex")
		let state = data[1]
		
		this.state = Buffer.from(state, "hex")
		this.load_power = parseInt(data[2])

		this.power = parseInt(state[2], 16)==1
		this.opMode = parseInt(state[3], 16)
		this.fanSpeed = parseInt(state[4], 16)
		this.swingMode = parseInt(state[5], 16)
		this.targetTemp = this.state.readUInt8(3)
		this.led = state[8]=="A"
		
		this.model = {
			raw: model,
			airConFormat: model.readInt8(0),
			airConType: model.readInt8(1),
			airConBrand: model.readInt16BE(2),
			airConRemote: model.readUInt32BE(4),
			airConState: model.readUInt8(8)
		}
		
		this.prefix = data[0].slice(0,2) + data[0].slice(8,16);
		this.suffix = data[0].slice(-1);
	}


	convertImpl(command: string, params: IAcCommand) {
		switch (command) {
			case "action.devices.QUERY" : return {
				method: "get_model_and_state",
				params: []
			}
			case "action.devices.commands.OnOff": return {
				method: "set_power", // toggle_plug 
				params: [(params as IOnOff).on?"on":"off"]
			}
			case "action.devices.commands.SetFanSpeed":
				return this.makeConfig({fanSpeed : (params as IFanSpeed).fanSpeed as number})
			case "action.devices.commands.ThermostatTemperatureSetpoint": 
				return this.makeConfig({targetTemp : (params as IThermostatTemperatureSetpoint).thermostatTemperatureSetpoint})
			case "action.devices.commands.ThermostatSetMode": 
				return this.makeConfig({opMode : parseInt( (params as IThermostatMode).thermostatMode )})
			default:
				throw Error(`Unsupported command: ${command}`);
		}
	}

	makeConfig(newparams : IVolatileAC) {
		let po = (newparams.power || this.power)?"0":"1"
		let mo = newparams.opMode || this.opMode
		let wi = newparams.fanSpeed || this.fanSpeed
		let sw = newparams.swingMode || this.swingMode
		let tt = newparams.targetTemp || this.targetTemp
		let li = (newparams.led || this.led)?"0":"A"
		
		const config = this.prefix+po+mo+wi+sw+tt.toString(16)+li+this.suffix
		return  {
			method: "send_cmd", 
			params: [config]
		}
	}
}

