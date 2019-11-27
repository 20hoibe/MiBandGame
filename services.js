import { UUID_BASE } from "./uuid";

export const S = {
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
      PEDO: UUID_BASE("0007")
    }
  },
  MIBAND_2: {
    uuid: 0xfee1,
    ch: {
      AUTH: "0009"
    }
  }
};
