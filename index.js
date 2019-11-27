import 'babel-polyfill';
import crypto from 'browserify-aes';
import {EventEmitter} from 'events';

const toArrayBuffer = function() {
  let args = [...arguments];

  // Convert all arrays to buffers
  args = args.map(function(i) {
    if (i instanceof Array) {
      return Buffer.from(i);
    }
    return i;
  })

  // Merge into a single buffer
  let buf = Buffer.concat(args);

  // Convert into ArrayBuffer
  let ab = new ArrayBuffer(buf.length);
  let view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }
  return ab;
}

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
      EVENT: UUID_BASE('0010'),
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
    DISABLE_MANUAL_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.MANUAL, VALUES.OFF]),
    ENABLE_MANUAL_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.MANUAL, VALUES.ON]),
    DISABLE_CONTINUOUS_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.CONTINUOUS, VALUES.OFF]),
    ENABLE_CONTINUOUS_MODE: toArrayBuffer([0x15, MODI.HEART_RATE.CONTINUOUS, VALUES.ON]),
  }
}

class MiBand extends EventEmitter {
  constructor() {
    super();

    this._key = Buffer.from('30313233343536373839404142434445', 'hex');
    this._authenticated = false;
  }

  async auth() {
    await this._authReqRandomKey();
    return await new Promise((resolve, reject) => {
      const reset = () => {
        this.off('error', reject);
        this.off('authenticated', resolve);
      };

      this.once('error', () => {
        reset();
        reject();
      });

      this.once('authenticated', () => {
        reset();
        resolve();
      });
    });
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
      eventChar,
    ] = await Promise.all([
      mi1.getCharacteristic(S.MIBAND_1.ch.TIME),
      mi1.getCharacteristic(S.MIBAND_1.ch.BATTERY),
      mi1.getCharacteristic(S.MIBAND_1.ch.PEDO),
      mi1.getCharacteristic(S.MIBAND_1.ch.EVENT),
      // ...
    ]);

    this.timeChar = timeChar;
    this.battChar = battChar;
    this.pedoChar = pedoChar;
    this.eventChar = eventChar;
  }

  /**
   * @param {Event} event 
   */
  async _handleEventCharChanged(event) {
    const buf = Buffer.from(event.target.value.buffer);
    const cmd = buf.toString('hex');

    switch (cmd) {
      case '04': {
        console.log('click button');
        this.emit('button');
        break;
      }
      default: {
        console.warn(`unknown event: ${cmd}`);
      }
    }
  }

  async _initMi2Service(gatt) {
    const mi2 = await gatt.getPrimaryService(S.MIBAND_2.uuid);

    const [authChar] = await Promise.all([
      mi2.getCharacteristic(UUID_BASE(S.MIBAND_2.ch.AUTH)),
      // ...
    ]);

    this.authChar = authChar;

    await this.authChar.startNotifications();
    this.authChar.addEventListener('characteristicvaluechanged', this._handleAuthCharChanged.bind(this));
  }

  /**
   * @param {Event} event
   */
  async _handleAuthCharChanged(event) {
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
        this.emit('authenticated');
        break;
      }
      case '100104':
      case '100204': {
        this.emit('error', new Error('failed key sending'));
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
      heartRateService.getCharacteristic(
        S.HEART_RATE.ch.HEART_RATE_CONTROL_POINT
      ),
      heartRateService.getCharacteristic(S.HEART_RATE.ch.HEART_RATE),
      // ...
    ]);

    this.heartRate = hr;
    this.heartRateControlPoint = hrcp;
  }

  async listenEvents() {
    await this.eventChar.startNotifications();
    this.eventChar.addEventListener('characteristicvaluechanged', this._handleEventCharChanged.bind(this));
  }

  async listenHeartRate() {
    await this.heartRate.startNotifications();
    this.heartRate.addEventListener('characteristicvaluechanged', this._handleHeartRateCharChanged.bind(this));
  }

  /**
   * @param {Event} event
   */
  async _handleHeartRateCharChanged(event) {
    console.log({event});
    const rate = Buffer.from(event.target.value.buffer).readUInt16BE(0);
    console.log({rate});
    this.emit('heart_rate', rate);
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

    return await new Promise((resolve, reject) => {
      this.once('heart_rate', resolve);
    });


    // const heartRateData = await this.heartRateControlPoint.readValue();
    // console.log(heartRateData);
    // const heartRate = new Uint8Array(heartRateData.buffer);
    // console.log(heartRate);
    // return heartRate;
  }

  async getPedoStats() {
    const data = await this.pedoChar.readValue();
    console.log(data);

    // one byte offset: [?, aaaa, bbbb]
    const buf = Buffer.from(data.buffer);
    console.log(buf);

    return {
      steps: buf.readUInt16LE(1),
      distance: buf.length >=  8 ? buf.readUInt32LE(5) : undefined,
      calories: buf.length >= 12 ? buf.readUInt32LE(9) : undefined
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
  mi.on('error', e => {
    console.error('miband error: ' , e);
  });

  try {
    await mi.init(gatt);
  } catch (e) {
    console.error('could not init mi band', e);
    return;
  }

  await mi.auth();

  try {
    await Promise.all([
      mi.listenHeartRate().catch(e => {
        console.error('listen heart rate failed', e);
        throw e;
      }),
      mi.listenEvents().catch(e => {
        console.error('listen events failed', e);
        throw e;
      })
    ]);
  } catch (e) {
    console.error('some listener failed', e);
    return;
  }

  mi.getBatteryInfo()
    .then(batteryInfo => console.log({batteryInfo}))
    .catch(e => console.error('cannot get battery info', e))
  ;
  mi.getDate()
    .then(date => console.log({date}))
    .catch(e => console.error('cannot get date', e))
  ;
  mi.getPedoStats()
    .then(pedoStats => console.log({pedoStats}))
    .catch(e => console.error('cannot get pedo stats', e))
  ;
  mi.getHeartRate()
    .then(heartRate => console.log({heartRate}))
    .catch(e => console.error('cannot get heart rate', e))
  ;
});
