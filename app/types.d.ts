/**
 * Copyright 2019, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface IStartStop {
  start: boolean;
  zone: string|undefined;
  multipleZones: string[]|undefined;
}

export interface IPause {
  pause : boolean
}

export interface ILocate {
  silent: boolean;
  lang: string;
}

export interface IModeSetting {
  updateModeSettings: {
    mode: string
  }
}

export interface IOnOff {
  on : boolean
}

export interface IFanSpeed {
  fanSpeed : string|number
}

export interface IThermostatTemperatureSetpoint {
  thermostatTemperatureSetpoint : number
}

export interface IThermostatMode {
  thermostatMode : 'off' | 'heat' | 'on' | 'eco' | 'cool' | 'auto' | 'dry' | 'fan-only'
}

export type IAcCommand = IOnOff | IFanSpeed | IModeSetting | IThermostatTemperatureSetpoint | IThermostatMode;

export type IVacuumCommand = IStartStop | IPause | ILocate | IModeSetting;

export type IFanPower = 101 | 102 | 103 | 104 | 105

export type IBatteryCapacity = 'CRITICALLY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL'

// interface IVacuumModes {
//   currentModeSettings: {
//     mode: IFanPower;
//   }
// }
interface IStatus {
  battery:number,
  clean_area:number,
  clean_time:number,
  dnd_enabled: 0 | 1,
  error_code: number,
  fan_power: IFanPower,
  in_cleaning: 0 | 1 | 2,
  in_returning: 0 | 1,
  in_fresh_state: 0 | 1,
  lab_status: 0 | 1,
  lock_status: 0 | 1,
  water_box_status: 0 | 1,
  map_present: 0 | 1,
  map_status: 0 | 1 | 2 | 3
  msg_seq:number,
  msg_ver:number,
  state: 0 | 1| 2| 3| 4| 5| 6| 7| 8|9 |10|11|12|13|14|15|16|17|100

  /*
  states = {
            1: 'Starting',
            2: 'Charger disconnected',
            3: 'Idle',
            4: 'Remote control active',
            5: 'Cleaning',
            6: 'Returning home',
            7: 'Manual mode',
            8: 'Charging',
            9: 'Charging problem',
            10: 'Paused',
            11: 'Spot cleaning',
            12: 'Error',
            13: 'Shutting down',
            14: 'Updating',
            15: 'Docking',
            16: 'Going to target',
            17: 'Zoned cleaning',
            18: 'Segment cleaning',
            100: 'Charging complete',
            101: 'Device offline',
        }
  */
}

export interface IDeviceState {
  online?: boolean
  status: string
}

export interface ISuccessState extends IDeviceState {
  status: "SUCCESS"
}

export interface IErrorState extends IDeviceState {
  errorCode: string
  status: "ERROR"
}

export interface IMiResponse {
  id: number
  result: [any]
  error?: {
    code: number,
    message: string
  }
}

export interface IMiCommand {
  //id: number;
  method: string;
  params?: any[];
}

export interface ISegment {
  aliases: [string],
  segments: [number];
  fan_power?: IFanPower;
}

export interface IZone {
  aliases: [string],
  zones: [[number,number,number,number,number]];
  fan_power?: IFanPower;
}

export interface IDeviceCustomData {
  token: string
}

export interface IVacumCustomData extends IDeviceCustomData {
  fan_power : IFanPower,
  segments?: Map<string, ISegment>,
  zones?: Map<string, IZone>,
  targets?: Record<string, [number,number]>
}