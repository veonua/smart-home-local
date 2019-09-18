# Roborock advance

This unofficial integration of the [Local Home SDK](https://developers.google.com/actions/smarthome/concepts/local) to control Roborock Vacuum cleaner. 

Current version supports :

+ device start/stop/pause
+ device docking
+ device location
+ zone(room) cleaning 
+ each zone has default mode 
    - eg. set higher suction power, when cleaning kitchen 
+ predefined device modes 
   1. mopping
   2. low
   3. balanced
   4. high
   5. turbo
+ predefined target points, go to position

Not supported:
+ UDP response is not available in Local Home SDK 0.1.0
  + see [issue](https://issuetracker.google.com/issues/139276385)

The Local Home SDK allows to execute smart home intents directly on Google Home smart speakers and Nest smart displays. 

## Prerequisites

- [Node.js](https://nodejs.org/) LTS 10.16.0+

## Run the sample

### Set up the smart home project

- Follow the instruction to deploy the [smart home provider sample for Node.js](https://github.com/actions-on-google/smart-home-nodejs).
- Follow the instructions to run the [smart home frontend](https://github.com/actions-on-google/smart-home-nodejs#setup-sample-service) locally.
- Upload backup from [Flole app](https://play.google.com/store/apps/details?id=de.flole.xiaomi&hl=en) on login

### Setup the virtual device

- Open the smart home project in the [Actions console](https://console.actions.google.com/), then perform these steps:
   - in `Build > Actions > Smart home > Actions`: Add the following attributes in the `Device Scan Configuration`:
     - **MDNS Service name**: `_miio._udp.local`

### Deploy the sample app

Serve the sample app locally from the same local network as the Home device,
or deploy it to a publicly reacheable URL endpoint.

#### Deploy locally

- Start the local development server:
```
npm install --prefix app/
npm start --prefix app/ -- --public 0.0.0.0:8080
```
Note: The local development server needs to listen on the same local network as the Home device in order to be able to load the Local Home SDK application.
- Go to the [smart home project in the Actions console](https://console.actions.google.com/)
- In `Test > On device testing`: set the development URL to http://local-dev-server-hostname-or-ip:8080/


### Test the Local Home SDK application

- Reboot the Google Home Device
- Open `chrome://inspect`
- Locate the Local Home SDK application and click `inspect` to launch the [Chrome developer tools](https://developers.google.com/web/tools/chrome-devtools/).
- Try the following query
  - `Where is my roborock`
  - `Start cleaning`
  - `Clean my living room`
  - `Set roborock mode to balanced`
  - `Set roborock mode to mop the floor`

## Test and Lint
```
npm test --prefix app/
npm run lint --prefix device/
```

## License
See `LICENSE`


## Projects helped to create this implementation
- https://npmjs.org/mijia
- https://github.com/rytilahti/python-miio
- https://github.com/actions-on-google/smart-home-local
- dust-cloud community
