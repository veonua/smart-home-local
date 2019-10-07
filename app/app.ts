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

/// <reference types="@google/local-home-sdk" />

import { IVacuumCommand,
         IStatus,
         IStartStop,
         IDeviceState,
         IModeSetting,
         IDeviceCustomData} from "./types";

import { VacuumDevice } from "./vacumdevice"
import { fan_power } from "./utils"

const config = require('./config.json')

const RESPONSE_SLEEP = 600;
const portNumber: number = 54321;

// HomeApp implements IDENTIFY and EXECUTE handler for smarthome local device execution.
export class HomeApp {
  private vacuums: Record<string, VacuumDevice> = {};

  constructor(private readonly app: smarthome.App) {
      this.app = app;
  }

  // public devicesHandler = (request: smarthome.IntentFlow.ReachableDevicesRequest):
  // smarthome.IntentFlow.ReachableDevicesResponse => {
  //   console.debug("ReachableDevices request", request);
    
  //   // Reference to the local proxy device
  //   const proxyDevice = request.inputs[0].payload.device.proxyDevice;
  //   // proxyDevice customData is json string =(
  //   const customData = request.devices[0].customData as IDeviceCustomData;
    
  //   const reachableDevices = [
  //     // Each verificationId must match one of the otherDeviceIds
  //     // in the SYNC response
  //     { verificationId: "roborock-vacuum-s5_miio260426251" },
  //     { verificationId: "mop-roborock-vacuum-s5_miio260426251" },
  //   ];

  //   console.debug("ReachableDevices ", reachableDevices);

  //   // Return a response
  //   const response: smarthome.IntentFlow.ReachableDevicesResponse = {
  //     intent: smarthome.Intents.REACHABLE_DEVICES,
  //     requestId: request.requestId,
  //     payload: {
  //       devices: reachableDevices,
  //     },
  //   };

  //   console.debug("ReachableDevices response", response);
    
  //   return response;
  // };

  // identifyHandlers decode UDP scan data and structured device information.
  public identifyHandler = (identifyRequest: smarthome.IntentFlow.IdentifyRequest):
    Promise<smarthome.IntentFlow.IdentifyResponse> => {
    console.log("IDENTIFY request", identifyRequest);
      
    const device = identifyRequest.inputs[0].payload.device;
    
    if (!device.mdnsScanData) 
      throw Error("invalid service "+name);

    let mdns_name = device.mdnsScanData.additionals[0].name // "roborock-vacuum-s5_miio260426251._miio._udp.local"
    if (!mdns_name.endsWith("._miio._udp.local"))
      throw Error("invalid service "+mdns_name);

    let parts = mdns_name.substr(0, mdns_name.length-17).split("_miio");
    let hwVersion = parts[0];
    let hwParts = parts[0].split("-")
    let devNumber = parseInt(parts[1]);    
    let devId = parts[1];
    // if (device.udpScanData) {
    //   const udpScanData = Buffer.from(device.udpScanData, "hex");
    //   console.debug("udpScanData:", udpScanData);
    // } 

    let cloudDevice = identifyRequest.devices.filter(x=>x.id==devId)[0];
    let customData = cloudDevice.customData as IDeviceCustomData;

    if (this.vacuums[devId] === undefined) {
      this.vacuums[devId] = new VacuumDevice(devNumber, customData.token, config.fan_power, config.zones, config.targets);
    }

    return new Promise((resolve) => {
      const identifyResponse = {
          intent: smarthome.Intents.IDENTIFY,
          requestId: identifyRequest.requestId,
          payload: {
            device: {
              id: devId,
              type: "action.devices.types.VACUUM",
              deviceInfo: {
                manufacturer: hwParts[0],
                model: hwParts[2],
                hwVersion: hwVersion,
                swVersion: "3.3.9_001864",
              },
              isProxy: false,
              verificationId: devId,
            }
          },
        };
        console.log("IDENTIFY response", identifyResponse);
        resolve(identifyResponse);
    });
  }

  // executeHandler send openpixelcontrol messages corresponding to light device commands.
  public executeHandler = (executeRequest: smarthome.IntentFlow.ExecuteRequest):
    Promise<smarthome.IntentFlow.ExecuteResponse> => {
    console.log("EXECUTE request:", executeRequest);
    // TODO(proppy): handle multiple inputs/commands.
    const command = executeRequest.inputs[0].payload.commands[0];
    // TODO(proppy): handle multiple executions.
    const execution = command.execution[0];

    // Create execution response to capture individual command
    // success/failure for each devices.
    const executeResponse =  new smarthome.Execute.Response.Builder()
      .setRequestId(executeRequest.requestId);
  
    // Handle light device commands for all devices.
    return Promise.all(command.devices.map(async (google_device) => {
      
      try {
        let vacuum = this.vacuums[google_device.id];
        
        const result : IDeviceState = await promiseFromCommand(this.app.getDeviceManager(), executeRequest.requestId, google_device.id, 
        vacuum, execution.command, (execution.params as IVacuumCommand));

        executeResponse.setSuccessState(google_device.id, result);
      }
      catch (e) {
        console.error(e);
        executeResponse.setErrorState(google_device.id, e.errorCode);
      }

    }))
    .then(() => {
      console.log("EXECUTE response", executeResponse);
      return executeResponse.build();
    });
  }
}

function _sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function promiseFromCommand(deviceManager:smarthome.DeviceManager, requestId: string, deviceId: string,
        device:VacuumDevice,
        command: string, params: IVacuumCommand) : Promise<IDeviceState> {
        
  if (device.needsHandshake) {
    const handshakeCommand = new smarthome.DataFlow.UdpRequestData();
    handshakeCommand.requestId = requestId;
    handshakeCommand.deviceId = deviceId;
    handshakeCommand.port = portNumber;
    handshakeCommand.data = "21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    
    const handshake : Promise<void> = deviceManager
          .send(handshakeCommand)
          .then((result: smarthome.DataFlow.UdpResponseData) => {
            console.log("handshake result", result);
            const device_hex = ("00000000" + device.deviceId.toString(16)).substr(-8);
            device.packet.raw = Buffer.from("2131002000000000" + device_hex + "5d53e8ab" + device.token, "hex");            
          })

    console.debug("sending hanshake...");
    await handshake

    await _sleep(RESPONSE_SLEEP);
  }

  // const statusRequest = sendRequest(deviceManager, requestId, deviceId, device.convert("action.devices.QUERY", params))
  // .then ((result) => {
  //           console.log("status result", result);
  //           //p.raw = Buffer.from("FF", "hex"); //result.data;
  //           let data = {}
  //           // if (result.data) {
  //           //   data = JSON.parse(p.data.toString());
  //           // } else {
  //             data = {state:5}
  //           // }
  //           return (data as IStatus);
  //         }
  // )
  
  // console.debug("fetching status...");
  // let status = await statusRequest;
  // await _sleep(RESPONSE_SLEEP);
  device.status = { state:5 } as IStatus
  
  let res = await sendRequest(deviceManager, requestId, deviceId, device.convert(command, params) )
        .then((result: smarthome.DataFlow.UdpResponseData) => {
          console.log("EXECUTE result", result);
          return device.onResponse(command, params, result)
          //p.raw = Buffer.from("FF", "hex"); // result.data;
          //TODO: p.data
        })

  switch (command) {
    case "action.devices.commands.SetModes": {
      device.fan_power = fan_power( (params as IModeSetting).updateModeSettings.mode )
      break;
    }

    case "action.devices.commands.StartStop": {
      const new_mode = device.resetModeIfNeed((params as IStartStop))
      if (new_mode) {
        await _sleep(RESPONSE_SLEEP);
        await sendRequest(deviceManager, requestId, deviceId, device.convert_fan_power(new_mode))
          .then((result: smarthome.DataFlow.UdpResponseData) => {
          console.log("EXECUTE set default mode ", result);
        })
      }
    }
  }
      
  return res
}

function sendRequest(
    deviceManager:smarthome.DeviceManager, 
    requestId:string, 
    deviceId:string, 
    buf:Buffer) : Promise<smarthome.DataFlow.UdpResponseData> {

  const req = new smarthome.DataFlow.UdpRequestData() 
  req.requestId = requestId;
  req.deviceId = deviceId;
  req.port = portNumber;
  req.data = buf.toString('hex');
  
  return deviceManager.send(req)
}
