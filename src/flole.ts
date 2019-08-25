
interface IFlole {
    h:string, // device model
    d:number, // device ID
    e:string, // token
    j:number, // ??
    c:string, // IP
    f:string  // device name
  }
  
export function loadFlole(buf:Buffer) : IFlole[] {
    const base64str = buf.toString("ascii");
    const encrypted = new Buffer(base64str, 'base64') 
    const Blowfish = require('egoroof-blowfish');
    const bf = new Blowfish('109876544BNNMOL', Blowfish.MODE.ECB, Blowfish.PADDING.NULL); // only key isn't optional 
    const decoded = bf.decode(encrypted, Blowfish.TYPE.STRING); // type is optional
    return JSON.parse(decoded.substring(0, decoded.indexOf('}]')+2))
}
  