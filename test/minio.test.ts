import * as fs from "fs-extra";
import os from "os";
import * as path from "path";
import MinIO, { ProcessObjectName } from "../src/minio";
import * as utils from "../src/utils";
import { testsCommon } from "./testsCommon";

const GUID = utils.GUID;
const windows = os.platform() === "win32";
const minioConf = testsCommon.GenMinIOConfig();
let minioInstance: MinIO;
let logSpy: jest.SpyInstance;
const otherFilePath = path.join(__dirname, "testsCommon.ts");

describe("MinIO", () => {
    beforeAll(async () => {
        logSpy = jest.spyOn(utils, "Log");
        minioInstance = new MinIO(minioConf);
        await minioInstance.Init();
    });

    describe("MinIO PutObject", () => {
        it("should successfully put a new object with unique name and file path", async () => {
            const filePath = __filename;
            const objectName = GUID();

            await minioInstance["PutObject"](objectName, filePath);
            const objectExists = await minioInstance.Client.statObject(
                minioConf.Bucket,
                objectName
            );

            expect(objectExists).toBeDefined();
            expect(objectExists.size).toBe((await fs.stat(filePath)).size);
        });

        it("should successfully put an object with existing name but different file path, updates object metadata", async () => {
            const objectName = GUID();
            const filePath = __filename;

            await minioInstance["PutObject"](objectName, filePath);
            await minioInstance["PutObject"](objectName, otherFilePath);

            const objectExists = await minioInstance.Client.statObject(
                minioConf.Bucket,
                objectName
            );
            expect(objectExists).toBeDefined();
        });

        it("should return undefined when putting an object with existing name and same file path, metadata matches", async () => {
            const objectName = GUID();
            const filePath = __filename;

            await minioInstance["PutObject"](objectName, filePath);
            const result = await minioInstance["PutObject"](
                objectName,
                filePath
            );

            expect(result).toBeUndefined();
        });

        it("should throw an error when object name is invalid or empty", async () => {
            const objectName = "";
            await expect(
                minioInstance["PutObject"](objectName, __filename)
            ).rejects.toThrow();
        });

        it("should throw an error when file path is invalid or empty", async () => {
            const objectName = GUID();
            const filePath = "";

            await expect(
                minioInstance["PutObject"](objectName, filePath)
            ).rejects.toThrow();
        });
    });

    describe("MinIO UpdateFile", () => {
        // Uploads a file successfully when given a valid object name and file path
        it("should upload a file successfully when given a valid object name and file path", async () => {
            const objectName = GUID();
            const filePath = __filename;

            await minioInstance.UploadFile(objectName, filePath);

            const objectExists = await minioInstance.Client.statObject(
                minioConf.Bucket,
                objectName
            );
            expect(objectExists).toBeDefined();
        });
    });

    describe("MinIO UpdateFile", () => {
        it("should update the file when it already exists", async () => {
            const objectName = GUID();
            const filePath = __filename;
            const putObjectSpy = jest.spyOn(minioInstance, <any>"PutObject");

            await minioInstance.UploadFile(objectName, filePath);
            await minioInstance.UpdateFile(objectName, otherFilePath);

            expect(putObjectSpy).toHaveBeenCalledWith(objectName, filePath);
            expect(logSpy).toHaveBeenCalledWith(
                `File updated successfully in ${minioInstance.Bucket}/${objectName}`
            );
        });

        it("should handle updating a file that does not exist", async () => {
            const objectName = GUID();
            const filePath = __filename;

            await expect(
                minioInstance.UpdateFile(objectName, filePath)
            ).rejects.toThrow(`UpdateFile: File ${objectName} not found`);
        });
    });

    describe("MinIO DeleteFile", () => {
        it("should delete the file when it exists", async () => {
            const objectName = GUID();
            const filePath = __filename;

            await minioInstance.UploadFile(objectName, filePath);
            await minioInstance.DeleteFile(objectName);

            await expect(
                minioInstance.Client.statObject(minioConf.Bucket, objectName)
            ).rejects.toThrow(/Not Found/);
        });

        it("should throw an error when the file does not exist", async () => {
            const objectName = GUID();
            await expect(minioInstance.DeleteFile(objectName)).rejects.toThrow(
                `DeleteFile: File ${objectName} not found`
            );
        });
    });

    describe("MinIO GetObjects", () => {
        it("should return an empty Map object if there are no objects in the bucket", async () => {
            const config = testsCommon.GenMinIOConfig();
            config.ListenUpdates = false; // Disable the listener cause removing the bucket conflicts with the object's update listener
            const minioInstance = new MinIO(config);

            try {
                await minioInstance.Init();
                const result = await minioInstance["GetObjects"]();

                expect(result).toBeInstanceOf(Map);
                expect(result.size).toBe(0);
            } finally {
                await minioInstance.RemoveBucket();
            }
        });

        it("should return a Map object with the names and metadata of all objects in the bucket with a specific prefix", async () => {
            const objectName = GUID();
            const filePath = __filename;
            await minioInstance.UploadFile(objectName, filePath);

            const result = await minioInstance["GetObjects"]();

            // Assert
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBeGreaterThan(0);
            expect(result.get(objectName)).toBeDefined();
        });
    });

    describe("ProcessObjectName", () => {
        it("should return the same string when no backslashes are present", () => {
            const objectName = "example";
            const result = ProcessObjectName(objectName);
            expect(result).toBe("example");
        });

        it("should return GUID string as is", () => {
            const GUIDObjectName = "a0b5d6c7-d8e9-f0a1-b2c3-d4e5f6a7b8c9";
            const result = ProcessObjectName(GUIDObjectName);
            expect(result).toBe(GUIDObjectName);
        });

        it("should replace a single backslash with a forward slash", () => {
            const objectName = "example\\test";
            const result = ProcessObjectName(objectName);
            const processed = windows ? "example/test" : "example\\test";
            expect(result).toBe(processed);
        });

        it("should replace a single backslash at the end of the string with a forward slash", () => {
            const objectName = "example\\";
            const result = ProcessObjectName(objectName);
            const processed = windows ? "example/" : "example\\";
            expect(result).toBe(processed);
        });

        it("should replace a single backslash at the beginning of the string with a forward slash", () => {
            const objectName = "\\example";
            const result = ProcessObjectName(objectName);
            const processed = windows ? "/example" : "\\example";
            expect(result).toBe(processed);
        });
    });

    afterAll(async () => {
        await minioInstance.RemoveBucket();
        logSpy.mockRestore();
    });
});
