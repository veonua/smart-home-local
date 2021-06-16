import { IStatus, IFanPower, IVacuumCommand, IStartStop, IZone, ISuccessState, IPause, ISegment, IVacumCustomData, IBatteryCapacity} from "./types"
import { IMiDevice } from "./midevice";
import { IModeSetting } from "./types"


interface IVacuumState extends ISuccessState {
    isRunning? : boolean
    isDocked?: boolean,
    isPaused? : boolean
    isCharging? : boolean,
    generatedAlert?: boolean,
    currentFanSpeedPercent?: number,
    descriptiveCapacityRemaining?: IBatteryCapacity,
    currentModeSettings?: {
        mode: string
    },
    capacityRemaining?: [{
        unit: "PERCENTAGE",
        rawValue: number
    }]
}

export function fan_power(mode:string) : IFanPower {
    return parseInt(mode) as IFanPower
}

export function fan_power_google(fan:number) : string {
    return fan.toString();
}


export function descriptiveCapacityRemaining(val:number) : IBatteryCapacity {
	if (val==100) {
		return "FULL"
	} else if (val<20) {
		return "CRITICALLY_LOW"
	} else if (val<30) {
		return "LOW"
	} else if (val<70) {
		return "MEDIUM"
	}
	return "HIGH"
}


export class VacuumDevice extends IMiDevice<IVacuumCommand, IVacuumState> {
	error_codes = {  
		0: "No error",
		1: "Laser distance sensor error",
		2: "Collision sensor error",
		3: "Wheels on top of void, move robot",
		4: "Clean hovering sensors, move robot",
		5: "Clean main brush",
		6: "Clean side brush",
		7: "Main wheel stuck?",
		8: "Device stuck, clean area",
		9: "Dust collector missing",
		10: "Clean filter",
		11: "Stuck in magnetic barrier",
		12: "Low battery",
		13: "Charging fault",
		14: "Battery fault",
		15: "Wall sensors dirty, wipe them",
		16: "Place me on flat surface",
		17: "Side brushes problem, reboot me",
		18: "Suction fan problem",
		19: "Unpowered charging station",
		21: "Laser disance sensor blocked",
		22: "Clean the dock charging contacts",
		23: "Docking station not reachable",
	}

	error_code: number = 0;
	
	onResponseImpl(command: string, params: IVacuumCommand, resp_result: any[]): IVacuumState {
		if (command == smarthome.Intents.QUERY) {
			const resp = resp_result[0] as IStatus
			this.status.state = resp.state
			this.error_code = resp.error_code
			this.fan_power = resp.fan_power
		
			return {
				status: 'SUCCESS',
				isRunning: this.is_on,
				isPaused: this.is_paused,
				isDocked: this.is_docked,
				isCharging: resp.state == 8,
				online: true,
				currentFanSpeedPercent: resp.fan_power,
				currentModeSettings: {
					mode: fan_power_google(resp.fan_power)
				},
				descriptiveCapacityRemaining: descriptiveCapacityRemaining(resp.battery),
				capacityRemaining: [
					{
						"unit": "PERCENTAGE",
						"rawValue": resp.battery
					}
				]
			}
		}
		
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
					//this.status.state = pause? 10 : 5
					break
				}

				case "action.devices.commands.Dock" : {
					//this.status.state = 15
					break
				}

				case "action.devices.commands.Locate": {
					return {
						status: 'SUCCESS',
						generatedAlert: true,
					};
				}
			}
		}

		return {
			status: 'SUCCESS',
			isRunning: this.is_on,
			isPaused: this.is_paused,
			online: true,
		};
	}

	public status: IStatus;
	zones: Record<string, IZone>;
	segments: Record<string, ISegment>;
	targets: Record<string, [number,number]>;
	default_fan_power: IFanPower;
	
	last_mode: IFanPower;
	last_mode_time: number =0 

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

	constructor(deviceId:number, token:string, customData : IVacumCustomData) {
		super("action.devices.types.VACUUM", deviceId, token)
		this.status = {} as IStatus;
		
		let default_fan_power:IFanPower = customData.fan_power
		let segments = customData.segments
		let zones = customData.zones
		let targets = customData.targets 

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
		return [5, 6, 11, 17, 18].includes(this.status.state)
	}

	get is_docked() : boolean {
		return [8, 9, 13, 14, 15, 100].includes(this.status.state)
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

	convertImpl(command: string, params: IVacuumCommand) {
		switch (command) {
			case smarthome.Intents.QUERY : return {
				method: "get_status",
			}
			case "action.devices.commands.SetModes" : {
				const settings = (params as IModeSetting).updateModeSettings
				
				return {
					method: "set_custom_mode",
					params: [fan_power(settings.mode)]
				}
			}
			case "action.devices.commands.StartStop" : {
				const p = (params as IStartStop);
				if (!p.start) {
					if (this.in_zone_cleaning && !this.is_paused) {
						return {
							method: "app_pause"
						};
					} else return {
						method: "app_stop"
					};  
				}
				var zones;
				if (p.multipleZones) {
					zones = p.multipleZones
				} else if (p.zone) {
					zones = [p.zone];
				}
				if (!zones) {
					return {
						method: "app_start" 
					};
				}
				const segment = this.segments[zones[0]]
				if (segment) 
					return {
						method: "app_segment_clean",
						params: zones.flatMap(zone=>this.segments[zone].segments)
					}
				const dzone = this.zones[zones[0]]
				if (dzone) 
					return {
						method: "app_zoned_clean",
						params: zones.flatMap(zone=>this.zones[zone].zones)
					};
				const target = this.targets[zones[0]]
				if (target) 
					return {
						method: "app_goto_target",
						params: target 
					}
				// default
				return {
						method: "app_start"
					};
			}
			case "action.devices.commands.PauseUnpause" : {
				let method = "app_pause"
				if (!(params as IPause).pause) {
					if (this.in_zone_cleaning) {
						method = "resume_zoned_clean" 
					} else {
						method = "app_start"
					}
				}
				return {
					method: method,
				}
			}
			case "action.devices.commands.Dock" :  return {
				method: "app_charge",
			}
			case "action.devices.commands.Locate": return {
				method: "find_me",
			};
			default:
				throw Error(`Unsupported command: ${command}`);
		}
	}

	convert_fan_power(value: IFanPower): Buffer {
		this.packet.data = Buffer.from(JSON.stringify({
			id:Math.floor(Math.random()*1024) + 1024,
			method: "set_custom_mode",
			params: [value]
		}), 'utf8');
		return this.packet.raw
	}
}


