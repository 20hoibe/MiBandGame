import 'babel-polyfill';
import crypto from 'browserify-aes';

const identity = x => x;
const toArrayBuffer = function() {
  let args = [...arguments];

  // Convert all arrays to buffers
  args = args.flatMap(identity);

  // Convert into ArrayBuffer
  let ab = new ArrayBuffer(args.length);
  let view = new Uint8Array(ab);
  for (let i = 0; i < args.length; ++i) {
    view[i] = args[i];
  }
  return ab;
};

const UUID_BASE = x => `0000${x}-0000-3512-2118-0009af100700`;

const S = {
  GENERIC_ACCESS: { uuid: 0x1800, ch: {} },
  GENERIC_ATTRIBUTE: { uuid: 0x1801, ch: {} },
  DEVICE_INFORMATION: { uuid: 0x180a, ch: {} },
  FIRMWARE: { uuid: UUID_BASE("1530"), ch: {} },
  ALERT_NOTIFICATION: { uuid: 0x1811, ch: {} },
  IMMEDIATE_ALERT: { uuid: 0x1802, ch: {} },
  HEART_RATE: {
    uuid: 0x180d,
    ch: {
      HEART_RATE: 0x2a37,
      HEART_RATE_CONTROL_POINT: 0x2a39
    }
  },
  MIBAND_1: {
    uuid: 0xfee0,
    ch: {
      TIME: 0x2a2b,
      BATTERY: UUID_BASE("0006"),
      PEDO: UUID_BASE('0007'),
    }
  },
  MIBAND_2: { uuid: 0xfee1, ch: {
    AUTH: '0009'
  } }
};

const VALUES = {
  OFF: 0x0,
  ON: 0x1
};

const MODI = {
  HEART_RATE: {
    CONTINUOUS: 0x1,
    MANUAL: 0x2
  }
};

const COMMAND = {
  HEART_RATE: {
    DISABLE_MANUAL_MODE: toArrayBuffer([0x15, COMMAND.HEART_RATE.MANUAL, VALUES.OFF]),
    ENABLE_MANUAL_MODE: toArrayBuffer([0x15, COMMAND.HEART_RATE.MANUAL, VALUES.ON]),
    DISABLE_CONTINUOUS_MODE: toArrayBuffer([0x15, COMMAND.HEART_RATE.CONTINUOUS, VALUES.OFF]),
    ENABLE_CONTINUOUS_MODE: toArrayBuffer([0x15, COMMAND.HEART_RATE.CONTINUOUS, VALUES.ON]),
  }
}

class MiBand {
  constructor() {
    this._key = Buffer.from('30313233343536373839404142434445', 'hex');
  }

  async init(gatt) {
    await Promise.all([
      this._initMi1Service(gatt),
      this._initMi2Service(gatt),
      this._initHeartRateService(gatt)
      // ...
    ]);
  }

  async _initMi1Service(gatt) {
    const mi1 = await gatt.getPrimaryService(S.MIBAND_1.uuid);

    const [
      timeChar,
      battChar,
      pedoChar,
    ] = await Promise.all([
      mi1.getCharacteristic(S.MIBAND_1.ch.TIME),
      mi1.getCharacteristic(S.MIBAND_1.ch.BATTERY),
      mi1.getCharacteristic(S.MIBAND_1.ch.PEDO),
      // ...
    ]);

    this.timeChar = timeChar;
    this.battChar = battChar;
    this.pedoChar = pedoChar;
  }

  async _initMi2Service(gatt) {
    const mi2 = await gatt.getPrimaryService(S.MIBAND_2.uuid);

    const [authChar] = await Promise.all([
      mi2.getCharacteristic(UUID_BASE(S.MIBAND_2.ch.AUTH)),
      // ...
    ]);

    this.authChar = authChar;

    await this.authChar.startNotifications();
    this.authChar.addEventListener('characteristicvaluechanged', this._handleCharacteristicChange.bind(this));
    await this.authChar.writeValue(toArrayBuffer([0x02, 0x08]));
  }

  /**
   * @param {Event} event
   */
  async _handleCharacteristicChange(event) {
    console.log({event});
    const buf = Buffer.from(event.target.value.buffer);
    const cmd = buf.slice(0, 3).toString('hex');

    console.log({cmd});

    switch (cmd) {
      case '100101': {
        await this._authReqRandomKey();
        break;
      }
      case '100201': {
        const rdn = buf.slice(3);
        
        const cipher = crypto
          .createCipheriv('aes-128-ecb', this._key, '')
          .setAutoPadding(false);
        const enc = Buffer.concat([cipher.update(rdn), cipher.final()]);
        await this._authSendEncKey(enc);
        break;
      }
      case '100301': {
        console.log('authenticated');
        break;
      }
      case '100104':
      case '100204': {
        console.error('failed key sending');
        break;
      }
      case '100304': {
        console.warn('auth failed, sending new key');
        await this._authSendNewKey(this._key);
        break;
      }
      default: {
        console.warn(`unknown command: ${cmd}`);
      }
    }
  };

  async _authSendNewKey(key) {
    await this.authChar.writeValue(toArrayBuffer([0x01, 0x08], key));
  }

  async _authReqRandomKey() {
    await this.authChar.writeValue(toArrayBuffer([0x02, 0x08]));
  }

  async _authSendEncKey(encrypted) {
    return await this.authChar.writeValue(toArrayBuffer([0x03, 0x08], encrypted));
  }

  async _initHeartRateService(gatt) {
    const heartRateService = await gatt.getPrimaryService(S.HEART_RATE.uuid);

    const [hrcp, hr] = await Promise.all([
      heartRateService.getCharacteristic(S.HEART_RATE.ch.HEART_RATE),
      heartRateService.getCharacteristic(
        S.HEART_RATE.ch.HEART_RATE_CONTROL_POINT
      )
      // ...
    ]);

    this.heartRate = hr;
    this.heartRateControlPoint = hrcp;
  }

  async getDate() {
    const data = await this.timeChar.readValue();
    console.log(data);

    const buf = new Uint8Array(data.buffer);
    const y = buf[1] * 256 + buf[0],
      mn = buf[2] - 1,
      d = buf[3],
      h = buf[4],
      m = buf[5],
      s = buf[6];
    return new Date(y, mn, d, h, m, s);
  }

  async getBatteryInfo() {
    const data = await this.battChar.readValue();
    console.log(data);

    const buf = new Uint8Array(data.buffer);
    return {
      level: buf[0],
      charging: !!buf[2],
      chargeLevel: buf[19]
    };
  }

  async getHeartRate() {
    await this.heartRateControlPoint.writeValue(
      COMMAND.HEART_RATE.DISABLE_CONTINUOUS_MODE
    );
    await this.heartRateControlPoint.writeValue(
      COMMAND.HEART_RATE.DISABLE_MANUAL_MODE
    );
    await this.heartRateControlPoint.writeValue(
      COMMAND.HEART_RATE.ENABLE_MANUAL_MODE
    );
    const heartRateData = await this.heartRateControlPoint.readValue();
    console.log(heartRateData);
    const heartRate = new Uint8Array(heartRateData.buffer);
    console.log(heartRate);
    return heartRate;
  }

  async getPedoStats() {
    const data = await this.pedoChar.readValue();
    console.log(data);

    // one byte offset: [?, aaaa, bbbb]
    const buf = new Uint32Array(data.buffer, 1);
    console.log(buf);

    return {
      steps: buf[0],
      distance: buf[1],
      calories: buf[2]
    };
  }
}

document.getElementById("pair").addEventListener("click", async () => {
  const optionalServices = Object.keys(S).map(k => S[k].uuid);
  console.log({optionalServices});
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ name: "MI Band 2" }],
    optionalServices
  });

  console.log(`connect with id: ${device.id}, name: ${device.name}.`);
  console.log(device);

  console.log("will connect gatt");
  const gatt = await device.gatt.connect();
  console.log(gatt);

  const mi = new MiBand();
  await mi.init(gatt);

  // mi.getBatteryInfo()
  //   .then(batteryInfo => console.log({batteryInfo}))
  //   .catch(e => console.error('cannot get battery info', e))
  // ;
  // mi.getDate()
  //   .then(date => console.log({date}))
  //   .catch(e => console.error('cannot get date', e))
  // ;
  // mi.getPedoStats()
  //   .then(pedoStats => console.log({pedoStats}))
  //   .catch(e => console.error('cannot get pedo stats', e))
  // ;
  // mi.getHeartRate()
  //   .then(heartRate => console.log({heartRate}))
  //   .catch(e => console.error('cannot get heart rate', e))
  // ;
});
