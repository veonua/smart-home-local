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

export type IVacuumCommand = IStartStop | IPause | ILocate | IModeSetting;

export type IFanPower = 101 | 102 | 103 | 104 | 105

interface IModes {
  currentModeSettings: {
    mode: IFanPower;
  }
}

interface IStatus {
  battery:number,
  clean_area:number,
  clean_time:number,
  dnd_enabled: 0 | 1,
  error_code: number,
  fan_power: number,
  in_cleaning: 0 | 1 | 2,
  map_present: 0 | 1,
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
  */
}

export interface IDeviceState {
  isRunning? : boolean,
  isPaused? : boolean,
  online?: boolean;
  generatedAlert?: boolean;
}

export type IVacuumState = IVacuumCommand & IDeviceState;

export interface IRoboVacuumResponse {
  id: number;
  result: any;
}

export interface IRoboVacuumCommand {
  id: number;
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
  token: string,
  fan_power : IFanPower,
  segments?: Map<string, ISegment>,
  zones?: Map<string, IZone>,
  targets?: Record<string, [number,number]>
}