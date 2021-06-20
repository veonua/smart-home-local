import { IAcCommand, IOnOff, IFanSpeed, IThermostatTemperatureSetpoint, IThermostatMode, ISuccessState} from "./types"
import { IMiDevice } from "./midevice";
// lumi.acpartner.v1
// 
interface IAcState extends ISuccessState {
	currentFanSpeedSetting? : string|number
	activeThermostatMode?: string
	thermostatMode?: string
	thermostatTemperatureAmbient?: number
	thermostatTemperatureSetpoint?: number
}

class AcState {
	targetTemp: number = 0;
	led: string = '0';
	power: boolean = false;
	opMode: number = 0;
	fanSpeed: number = 0;
	swingMode: number = 0;

	constructor (state?: string) {
		if (!state) return

		let stateBuf = Buffer.from(state, "hex")
		this.power = parseInt(state[2], 16)==1
		this.opMode = parseInt(state[3], 16)
		this.fanSpeed = parseInt(state[4], 16)
		this.swingMode = parseInt(state[5], 16)
		this.targetTemp = stateBuf.readUInt8(3)
		this.led = state[8]
	}

	opModeString() {
		if (!this.power) {
			return 'off'
		}
		const modes = ['heat', 'cool', 'eco', 'dry', 'fan-only']
		return modes[this.opMode]
	}

	
	parseThermostatMode (val:IThermostatMode) {
		switch (val.thermostatMode) {
			case 'heat': return 0
			case 'cool': return 1
			case 'auto': return 2
			case 'eco': return 2
			case 'dry': return 3
			case 'fan-only': return 4 
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

	toState() : IAcState {
		return {
			status: 'SUCCESS',
			online: true,
			currentFanSpeedSetting: this.fanSpeed.toString(),
			activeThermostatMode: this.opModeString(), 
			thermostatMode: this.opModeString(),
			thermostatTemperatureSetpoint: this.targetTemp,
			//thermostatTemperatureAmbient: this.targetTemp
		};
	}

	merge(newparams: Partial<AcState>) {
		let res = new AcState()
		res.power = (newparams.power ?? this.power)//? "1":"0"
		res.opMode = newparams.opMode ?? this.opMode
		res.fanSpeed = newparams.fanSpeed ?? this.fanSpeed
		res.swingMode = newparams.swingMode ?? this.swingMode
		res.targetTemp = Math.round( newparams.targetTemp ?? this.targetTemp )
		res.led = (newparams.led ?? this.led)
		return res
	}
}

export class AcPartnerDevice extends IMiDevice<IAcCommand, IAcState> {
	load_power: number = 0;
	model?: { raw: Buffer; 
		airConFormat: number; 
		airConType: number; 
		airConBrand: number; 
		airConRemote: number; 
		airConState: number; };
	state:AcState = new AcState()
	new_state?:AcState
	
	prefix: string='';
	suffix: string='';
	error_codes = {
		'-1': "transientError",
		'-5005': "lockedToRange"
	};
	
	constructor(deviceId:number, token:string, customData : any) {
		super("action.devices.types.AC_UNIT", deviceId, token)
	}
	
	onQueryResponseImpl(data: string[]): IAcState {
		// ["010500220001186701","011130190100011867","0"]
		let model = Buffer.from(data[0], "hex")
		this.state = new AcState(data[1])		
		this.load_power = parseInt(data[2])
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
		return this.state.toState()
	}

	convertImpl(command: string, params: IAcCommand) {
		switch (command) {
			case smarthome.Intents.QUERY : return {
				method: "get_model_and_state",
				params: []
			}
			case "action.devices.commands.OnOff": return {
				method: "set_power", // toggle_plug 
				params: [(params as IOnOff).on?"on":"off"]
			}
			case "action.devices.commands.SetFanSpeed":
				return this.makeConfig({power: true, fanSpeed : (params as IFanSpeed).fanSpeed as number})
			case "action.devices.commands.ThermostatTemperatureSetpoint": 
				return this.makeConfig({targetTemp : (params as IThermostatTemperatureSetpoint).thermostatTemperatureSetpoint})
			case "action.devices.commands.ThermostatSetMode": 
				const mode = params as IThermostatMode
				if (mode.thermostatMode=='off' || mode.thermostatMode=='on') {
					return this.makeConfig({ power: mode.thermostatMode=='on' } )
				} else
					return this.makeConfig({
						power: true,
						opMode : this.state.parseThermostatMode( (params as IThermostatMode) )
					})
			default:
				throw Error(`Unsupported command: ${command}`);
		}
	}

	makeConfig(newparams : Partial<AcState>) {
		this.new_state = this.state.merge(newparams)
		
		let news = this.new_state
		const config = this.prefix + (news.power?"1":"0")+news.opMode+news.fanSpeed+news.swingMode+news.targetTemp.toString(16)+news.led+this.suffix
		console.log("send_cmd " + config)
		return  {
			method: "send_cmd", 
			params: [config]
		}
	}
}

