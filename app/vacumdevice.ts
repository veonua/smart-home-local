import { IStatus, IFanPower, IVacuumCommand, IStartStop, IZone, IDeviceState, IPause, ISegment, IRoboVacuumResponse } from "./types"
import { Packet } from "./packet";
import { roboFromCommand } from "./utils";

// export interface IMyZone {
// 	zones: [[number,number,number,number,number]];
// 	fan_power?: IFanPower;
//   }

export class VacuumDevice {
	onResponse(command: string, params: IVacuumCommand, result: smarthome.DataFlow.UdpResponseData): IDeviceState {
	this.packet.updateLast(); 
	var resp = this.decode(result.udpResponse.responsePackets)   
	var resp_result = resp?.result

	if (resp_result == ['ok']) {
		switch (command) {
			case "action.devices.commands.StartStop": {
				const p = (params as IStartStop)
				if (!p.start) {
					this.status.state = 6
				} else {
					const zone = p.zone
					if (zone) {
						if (this.zones[zone])
							this.status.state = 17
						else if (this.targets[zone])
							this.status.state = 16
					} else {
						this.status.state = 5
					}
				}
				break
			}

			case "action.devices.commands.PauseUnpause" : {
				const pause = (params as IPause).pause
				this.status.state = pause? 10 : 5
				break
			}

			case "action.devices.commands.Dock" : {
				this.status.state = 15
				break
			}

			case "action.devices.commands.Locate": {
				return {
					generatedAlert: true,
				};
			}
		}
	}

	return {
		isRunning: this.is_on,
		isPaused: this.is_paused,
		online: true,
		};
	}

	public packet: Packet;
	public status: IStatus;
	zones: Record<string, IZone>;
	segments: Record<string, ISegment>;
	targets: Record<string, [number,number]>;
	deviceId: number;
	token: string;
	default_fan_power: IFanPower;
	
	last_mode: IFanPower;
	last_mode_time: number =0 

	get needsHandshake() { return this.packet.needsHandshake };

	resetModeIfNeed(par: IStartStop) : IFanPower | null {
		if (!par.start) return null                                               // do not set mode if stop
		if (Date.now() - this.last_mode_time<30*60*1000) {                        // send last selected mode
			this.last_mode_time = Date.now()	
			return this.last_mode    
		}

		if (!par.zone) {
			this.last_mode = this.default_fan_power 
		} else {
			const z = this.zones[par.zone]
			if (z && z.fan_power) {
				this.last_mode = z.fan_power		
			} else {
				this.last_mode = this.default_fan_power
			}
		}

		return this.last_mode
	}

	constructor(deviceId:number, token:string, 
				default_fan_power:IFanPower, segments?: Map<string, ISegment>, zones?: Map<string, IZone>, targets?:Record<string, [number, number]>) {
		this.status = {} as IStatus;
		this.token = token
		this.deviceId = deviceId
		this.packet = new Packet(deviceId) // token

		this.zones = {};
		if (zones) {
			Object.entries(zones).forEach( 
				([key,value])=> {
				this.zones[key] = value
				if (value.aliases) {
					for (let alias of value.aliases) {
						this.zones[alias] = value
					}
				}
			})
		}

		this.segments = {};
		if (segments) {
			Object.entries(segments).forEach( 
				([key,value])=> {
				this.segments[key] = value
				if (value.aliases) {
					for (let alias of value.aliases) {
						this.segments[alias] = value
					}
				}
			})
		}
		
		if (targets) {
			this.targets = targets
		} else {
			this.targets = {}
		}
		this.default_fan_power = default_fan_power
		this.last_mode = default_fan_power;
	}

	set fan_power(val:IFanPower) {
		this.status.fan_power = val
		this.last_mode = val
		this.last_mode_time = Date.now()
	}

	get is_on() : boolean {
		return [5,6,11,17,18].includes(this.status.state)
	}

	get is_paused() {
		return this.status.state == 10
	}

	get in_zone_cleaning() : boolean {
		return this.status.state == 17
	}

	get got_error() {
		return this.status.error_code != 0
	}

	convert(command: string, params: IVacuumCommand) {
		const cmd = roboFromCommand(command,params, this)
				
		this.packet.data = Buffer.from(JSON.stringify(cmd), 'utf8');
		return this.packet.raw
	}

	convert_fan_power(value: IFanPower): Buffer {
		this.packet.data = Buffer.from(JSON.stringify({
			id:Math.floor(Math.random()*1024) + 1024,
			method: "set_custom_mode",
			params: [value]
		}), 'utf8');
		return this.packet.raw
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
}


