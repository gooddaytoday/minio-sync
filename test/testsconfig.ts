import * as uuid from "uuid";
import { IMinIOConfig } from "../src/minio";

export module testsconfig {
    export function GenMinIOConfig(): IMinIOConfig {
        const uid = uuid.v4();
        return {
            Bucket: "test-store-" + uid,
            EndPoint: "127.0.0.1",
            Port: 9000,
            UseSSL: false,
            AccessKey: "746hJX62eK7wE31YnwO9",
            SecretKey: "0UIvRlAYrjOxl8R4K33joELAXMOls8YntmhtetKQ",
        };
    }
}
