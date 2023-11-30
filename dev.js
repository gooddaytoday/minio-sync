const path = require("path");
const Sync = require("./index").default;

const DefaultSyncFolder = ""; // Put your folder to sync here
const SyncFolder = DefaultSyncFolder || path.join(process.env.HOME, "/store/");

Sync(
    SyncFolder,
    {
        Permissions: {
            Read: true,
            Write: true,
        },
        MinIO: {
            Bucket: "test-store",
            EndPoint: "127.0.0.1",
            Port: 9000,
            UseSSL: false,
            AccessKey: "746hJX62eK7wE31YnwO9",
            SecretKey: "0UIvRlAYrjOxl8R4K33joELAXMOls8YntmhtetKQ",
        }
});