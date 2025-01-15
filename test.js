const SourceBridge = require('./sourceBridge');
const readline = require('readline');

const bridge = new SourceBridge();

bridge.on('connect', (gameName, method) => console.log('Connected to '+ (gameName||"a Compatible Source Game") +' using '+ method +'!'));
bridge.on('disconnect', () => {console.log('Disconnected!'); process.exit(0);});

bridge.connect().then(() => {
    if (bridge.isConnected) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    
        const promptCommand = () => {
            rl.question('> ', async (command) => {
                try {
                    await bridge.run(command);
                    if (['quit', 'exit'].includes(command.toLowerCase())) {
                        rl.close();
                    } else {
                        promptCommand();
                    }
                } catch (err) {
                    console.error(err);
                    promptCommand();
                }
            });
        };
    
        promptCommand();
    } else {
        console.log('No compatible Source game connected.');
    }
});