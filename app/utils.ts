import { IStatus, IFanPower, IVacuumCommand, IRoboVacuumCommand, IModeSetting, IPause, IStartStop } from "./types"
import { VacuumDevice } from "./vacumdevice";


export function fan_power(mode:string) : IFanPower {
    switch (mode) {
      case "low": return 101;
      case "balanced": return 102;
      case "high" : return 103;
      case "Turbo_On": return 104;
      case "mop the floor": return 105;
      default: throw Error("unknown mode '" + mode + "'")
    }
  }
  


export function roboFromCommand(command: string, params: IVacuumCommand, device: VacuumDevice) : IRoboVacuumCommand {
	let id = Math.floor(Math.random()*1024) + 1;
	
	switch (command) {
	  case "action.devices.QUERY" : return {
		  id:id,
		  method: "get_status",
		}
	  
	  case "action.devices.commands.SetModes" : {
		const settings = (params as IModeSetting).updateModeSettings
		
		return {
		  id:id,
		  method: "set_custom_mode",
		  params: [fan_power(settings.mode)]
		}
      }
      
	  case "action.devices.commands.StartStop" : {
		const p = (params as IStartStop);
		if (!p.start) {
          if (device.in_zone_cleaning && !device.is_paused) {
            return {
                id: id,
                method: "app_pause"
              };
          } else return {
			id: id,
			method: "app_stop"
		  };  
		}
  
        if (!p.zone) {
            return {
                id: id,
                method: "app_start" 
              };
        }

		const segment = device.segments[p.zone]
		if (segment) 
			return {
				id: id,
				method: "app_segment_clean",
				params: segment.segments
			}

        const zone = device.zones[p.zone]
        if (zone) 
            return {
                id: id,
                method: "app_zoned_clean",
                params: zone.zones
              };

        const target = device.targets[p.zone]
        if (target) 
              return {
                id: id,
                method: "app_goto_target",
                params: target 
			  }
			  
		
        // default
        return {
                id: id,
                method: "app_start"
              };
	  }
  
	  case "action.devices.commands.PauseUnpause" : {
		let method = "app_pause"
		if (!(params as IPause).pause) {
		  if (device.in_zone_cleaning) {
			method = "resume_zoned_clean" 
		  } else {
			method = "app_start"
		  }
		}
  
		return {
		  id:id,
		  method: method,
		}
	  }
  
	  case "action.devices.commands.Dock" :  return {
		  id: id,
		  method: "app_charge",
		}
	  
	  case "action.devices.commands.Locate": return {
		  id: id,
		  method: "find_me",
		};
	  
	  default:
		throw Error(`Unsupported command: ${command}`);
	}
  }
