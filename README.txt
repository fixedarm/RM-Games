OFFSHORE GAS PLATFORM ASSET MANAGEMENT GAME
===========================================

This is a real-time, browser-based collaborative team-building game for 4 teams of 5 players, themed around offshore gas platform late-life asset management.

PREREQUISITES:
--------------
1. Node.js must be installed on the host laptop.
   - If not installed, download it from: https://nodejs.org (LTS version recommended).

STEP-BY-STEP RUN INSTRUCTIONS:
------------------------------

STEP 1: Extract the ZIP File
Extract the contents of this ZIP file to a folder on the host laptop (e.g., on the Desktop or Documents folder).

STEP 2: Install Dependencies
1. Open a command prompt or terminal window.
2. Navigate to the extracted folder. E.g.:
   cd "C:\path\to\LLAM - HARD"
3. Run the following command to download and install the required packages:
   npm install

STEP 3: Start the Game Server
1. In the same terminal window, start the server by running:
   npm start
2. You should see a message in the terminal:
   ========================================================
   Offshore Asset Management Game running on port 3000
   Access the game locally at http://localhost:3000
   ========================================================

STEP 4: Connect Players
1. Find the local network IP address of the host laptop (e.g., run `ipconfig` on Windows or `ifconfig` on Mac/Linux). It will look like `192.168.1.XX` or `10.0.0.XX`.
2. Ensure all players' devices (laptops, phones, or tablets) are connected to the SAME Wi-Fi network as the host laptop.
3. Players can connect by opening their mobile/desktop browsers and going to:
   http://<HOST-IP-ADDRESS>:3000
   (e.g., http://192.168.1.15:3000)

STEP 5: Facilitate the Game
1. The game coordinator/host can log in as the facilitator by opening a browser on the host laptop and going to:
   http://localhost:3000
2. Click the "Facilitator Console" button at the bottom of the Lobby screen.
3. Enter the facilitator passcode:
   007
4. From the console, the facilitator can initialize the game, start/pause the round timers, and advance rounds.

GAMEPLAY CONTROLS:
------------------
- Only the "Asset Manager (Team Leader)" [FA role] on each team has the authority to submit final decisions.
- Other team members can type values in their terminals to update the team's draft answers, edit the shared notepad, and coordinate clues.
- If teams are tied after Round 5, a high-stakes Tie-Breaker Round will automatically launch. The first team to order the Blackstart sequence correctly wins the game.
