const { Telnet } = require('telnet-client');
const { execSync } = require('child_process');
const path = require('path');
const { execFile } = require('child_process');

let psList;

class SourceBridge {
    constructor(verbose = false) {
        this.verbose = verbose;
        this.tn = null;
        this.gameExe = null;
        this.gameDir = null;
        this.gameName = null;
        this.modDir = null;
        this.isConnected = false;
        this.eventListeners = {};
    }

    gameVersions = {
        garrysmod: 'GarrysMod',
        tf2: 'Team Fortress 2',
        portal2: 'Portal 2',
        portal: 'Portal',
        cstrike: 'Counter-Strike Source',
        csgo: 'Counter-Strike Global Offensive',
        hl2: 'Half-Life 2'
    }

    getExecutablePath(pid) {
        try {
            const command = `wmic process where processid=${pid} get ExecutablePath /value`;
            const output = execSync(command, { encoding: 'utf-8' });
            const match = output.match(/ExecutablePath=(.*)/);
            return match ? match[1].trim() : null;
        } catch (err) {
            this.verbose && console.error(`Failed to get executable path for PID ${pid}:`, err);
            return null;
        }
    }

    async monitorProcess(pid, callback) {
        if (!psList) {
            psList = (await import('ps-list')).default;
        }

        const interval = setInterval(async () => {
            const processes = await psList();
            const isRunning = processes.some((process) => process.pid === pid);
            if (!isRunning) {
                clearInterval(interval);
                callback(); // Llama al callback cuando el proceso termina
            }
        }, 1000); // Comprobación cada segundo
    }

    on(eventType, callback=(gameName, method) => {}) {
        if (!(["connect", "disconnect"].includes(eventType))) {
            throw new Error(`Invalid event type: ${eventType}`);
        }

        if (!this.eventListeners[eventType]) {
            this.eventListeners[eventType] = [];
        }
        this.eventListeners[eventType].push(callback);
    }

    async connect() {
        if (!psList) {
            psList = (await import('ps-list')).default;
        }

        if (this.tn === null) {
            this.verbose && console.log("Trying to connect to game...");

            try {
                this.tn = new Telnet();
                await this.tn.connect({
                    host: '127.0.0.1',
                    port: 2121,
                    negotiationMandatory: false
                });

                await this.tn.send("version\n")
                await this.tn.nextData()
                var a = await this.tn.nextData()
                const aTrimmed = a.slice(0, -2);
                const versionMatch = aTrimmed.match(/\((.+)\)$/);
                var gameName = versionMatch ? versionMatch[1] : undefined;

                if (gameName) {
                    gameName = this.gameVersions[gameName.toLowerCase()] || gameName;
                }

                
                this.tn.on('close', () => {
                    this.tn = null;
                    this.isConnected = false;
                    if (this.eventListeners['disconnect']) {
                        this.eventListeners['disconnect'].forEach(callback => callback());
                    }
                })

                this.isConnected = true;
                this.verbose && console.log("Connected to compatible Source game! (NetCon)");

                if (this.eventListeners['connect']) {
                    this.eventListeners['connect'].forEach(callback => callback(gameName, "netcon"));
                }

                return true;
            } catch (err) {
                this.tn = false;

                try {
                    const gameExecs = ["hl2.exe", "csgo.exe", "portal2.exe"];
                    const modDirs = Object.fromEntries(Object.entries(this.gameVersions).map(([key, value]) => [value, key]));

                    const processes = await psList();

                    for (const process of processes) {
                        if (gameExecs.includes(process.name)) {
                            const executablePath = this.getExecutablePath(process.pid);
                            if (executablePath) {
                                this.gameExe = executablePath;
                                this.gameDir = path.dirname(this.gameExe);
                                this.gameName = path.basename(this.gameDir);
                                this.modDir = path.join(this.gameDir, modDirs[this.gameName]);
                                this.isConnected = true;
                                this.verbose && console.log(`Connected to ${this.gameName}! (Hijack)`);

                                this.monitorProcess(process.pid, () => {
                                    this.isConnected = false;
                                    if (this.eventListeners['disconnect']) {
                                        this.eventListeners['disconnect'].forEach(callback => callback());
                                    }
                                });

                                if (this.eventListeners['connect']) {
                                    this.eventListeners['connect'].forEach(callback => callback(this.gameName, "hijack"));
                                }

                                return true;
                            }
                        }
                    }
                } catch (err) {
                    this.verbose && console.error("Error while searching for processes:", err);
                }

                if (!this.isConnected) {
                    this.verbose && console.log("Could not connect to compatible Source Game :(");
                    return false;
                }
            }
            return false;
        } else {
            return this.isConnected;
        }
    }

    async run(command) {
    if (this.tn === null) {
        await this.connect();
    }

    if (this.isConnected) {
        if (this.tn) {
            await this.tn.send(`${command}\n`);
        } else {
            const launchParams = [this.gameExe, '-hijack', '+', command];

            execFile(this.gameExe, launchParams, { detached: true }, (err, stdout) => {
                if (err) {
                    this.verbose && console.error("Error launching game with command:", err);
                }
                console.log(stdout)
            });

            // Allow some time for the command to execute
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        return true;
    } else {
        throw new Error("Compatible Source Game not Connected.");
    }
}
}

module.exports = SourceBridge;