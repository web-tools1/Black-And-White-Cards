console.log("Starting...");

//Shorthand:
//require('express')();
var express = require('express');
var app = express();

var server = require('http').createServer(app);

var io = require('socket.io')(server);

/*var io = require('../..')(server);
Equiv of:
var socket = require("../../index.js");
var io     = socket(server);
*/
const port = process.env.PORT || 80;

server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Routing
// Sends requested files in /public directory
app.use(express.static(__dirname + '/public'));

app.get('/game/*', function(req, res) {
	res.sendFile("/game/index.html", {root: './public'});
});


const defaultCards = require('./defaultCards.js');

const blackCards = defaultCards.black;
const whiteCards = defaultCards.white;

var gamesCount = 1;

var secondsDelayBetweenRounds = 3;

var games = {};

//Round Timeout time, in milliseconds
const timeOut = 100*1000;

var connectedUsers = 0;

var availableIDs = [];

io.on('connection', function(socket) {

	connectedUsers++;

	socket.on('getPlayersOnline', function (data) {
		socket.emit('playersOnline', connectedUsers);
	});

	socket.game = {
		name: 'Nobody',
		status: 'Waiting',
		score: 0,
		cards: []
	}

	socket.on('disconnect', function(){
		connectedUsers--;
		if (socket.gameID) {
			updatePlayerList(socket.gameID);
		}
	});

	socket.on('setName', function (data) {
		if (typeof data !== 'string') return;
		if (data.length > 30) data = data.slice(0,30);
		
		socket.game.name = data;
		if (socket.gameID) updatePlayerList(socket.gameID);
	});
  
  	socket.on('connectToGame', function (data) {
  		if (typeof data !== 'string') return;
  		var gameID = data.toString();

  		if (!games[gameID]) {
			socket.emit('log', 'The Game you have attempted to join does not exist...');
			socket.emit('log', 'Please return to the menu and try again, or create a new game.');
			socket.emit('status', { actionRequired: 1, waitingOn: 'The Game you have attempted to join does not exist' });
  			return;
  		}

  		socket.emit('log', 'Joining game '+gameID);
  		socket.join(gameID);
  		socket.gameID = gameID;
  		updatePlayerList(gameID);
	});

  	socket.on('newGame', function(data) {
  		if (typeof data !== 'object') return console.log("Invalid input");
		if (typeof data.password !== 'string') return console.log("Invalid input");
		if (typeof data.maxPlayers !== 'number') return console.log("Invalid input");

		if (data.password.length > 100) return console.log("Invalid input");
		if (data.maxPlayers > 10) data.maxPlayers = 10;

  		var password = data.password;
  		var cardPacks = data.cardPacks;
		var maxPlayers = data.maxPlayers;
		var timeoutEnabled = data.timeoutEnabled;
		
		var gameID = "";

		if (availableIDs.length) {
			availableIDs.sort();
			gameID = availableIDs[0];
			availableIDs.splice(0,1);
		} else {
			gameID = gamesCount.toString()
			gamesCount++;
		}
		
  		games[gameID] = {
			host: this.id,
			hostName: this.game.name,
  			gameID: gameID,
  			password: password,
  			cardPacks: cardPacks,
  			playerCount: 1,
  			maxPlayers: maxPlayers,
  			timeoutEnabled: timeoutEnabled,
  			round: 0,
  			status: 'Waiting for the Host to start the game'
  		};

		socket.gameID = gameID;
  		socket.emit('log', 'Game '+gameID +' created.');
  		socket.emit('newGameJoined', gameID);

  		socket.join(gameID);

		updatePlayerList(gameID);
	});

	
	socket.on('getServers', function(){
		var servers = [];
		Object.keys(games).forEach(function(gameID) {
			var gameData = games[gameID];
			//if (!gameData.password)
				var server = {
					host: gameData.hostName,
					playerCount: gameData.playerCount,
					round: gameData.round,
					id: gameID
				};
				servers.push(server);

		});
		socket.emit('serverList', servers);
	});

	socket.on('playCard', function(data){
		if (typeof data !== 'string') return;
		if (socket.id === games[socket.gameID].czar) {
			socket.emit('log', "You connot play a card as you are the czar");
			return;
		}

		var cardIndex = socket.game.cards.indexOf(data);

		var gameID = socket.gameID;

		//Check if player owns the card played
		if (cardIndex === -1) {
			socket.emit('log', "You do not have the card: "+data);
			socket.emit('updateWhiteCards', socket.game.cards);
			return;
		}

		//Check that the player hasn't already played a card'
		var hasPlayedCard = false;
		games[socket.gameID].cardsPlayed.forEach(function(i) {
			if (i.player === socket.id) hasPlayedCard = true;
		});
		if (hasPlayedCard) return;
		
		socket.game.cards.splice(cardIndex,1);
		socket.emit('updateWhiteCards', socket.game.cards);
		socket.emit('log', "You have played the card: "+data);
		games[socket.gameID].cardsPlayed.push({
			player: socket.id,
			card: data
		});

		//Check if all players have played their cards
		var playerCount = getSocketsInRoom(gameID);
		if (games[gameID].cardsPlayed.length === playerCount.length-1) {
			roundTimeout(gameID);
		} else {
			io.sockets.in(gameID).emit('showBlankCards', games[gameID].cardsPlayed.length);
			socket.emit('status', { actionRequired: 0, waitingOn: 'Waiting on player card choices' });
			socket.game.status = 'Ready';
		}
	});

	socket.on('czarChoice', function(data){
		if (typeof data !== 'string') return;
		// TODO: Check if the player is the current Czar


		var cardText = data;

		//Find card owner
		var owner = null;
		games[socket.gameID].cardsPlayed.forEach(function(i) {
			if (i.card === cardText) owner = i.player;
		});
		
		//add point to owner's score
		if (owner) {
			var winner = getSocketFromID(owner);
			winner.game.score++;
			if (winner.game.score >= 10) {
				io.sockets.in(socket.gameID).emit('log', 'The winner of the game is: '+ winner.game.name);
				io.sockets.in(socket.gameID).emit('status', { actionRequired: 0, waitingOn: winner.game.name + ' is the Winner!' });
				io.sockets.in(socket.gameID).emit('state','none');
				return;
			}
			io.sockets.in(socket.gameID).emit('log', 'The winner of this round is: '+ winner.game.name);
		} else { 
			console.log("Warn: Winner for round not found"); 
		}
		
		updatePlayerList(socket.gameID);

		//Start next round
		startRound(socket.gameID);
	});

	socket.on('startGame', function(){
		var gameID = socket.gameID;
		var gameData = getGameData(gameID);

		if (typeof gameData === 'string') {
			socket.emit('log', gameData);
			return;
		}

		if (gameData.host !== socket.id) {
			socket.emit('log', 'You cannot start the game as you are not the host.');
			return;
		}

		io.sockets.in(gameID).emit('log', 'Game Started');

		startRound(gameID);
	});

});


/**
 *	Starts a new round for the game ID provided
 *	@param	{String} gameID	
 *  @TODO 	Add in defined delay using secondsDelayBetweenRounds before the next round start
 */
function startRound(gameID) {
	games[gameID].round++;
	games[gameID].status = 'Playing round ' +games[gameID].round;
	games[gameID].cardsPlayed = [];

	io.sockets.in(gameID).emit('showBlankCards');
	io.sockets.in(gameID).emit('log', 'Round '+games[gameID].round +' started');

	setCzar(gameID);
	updatePlayerList(gameID);
	
	sendBlackCard(gameID);

	//Make sure everyone has 10 white cards
	var players = getSocketsInRoom(gameID);
	players.forEach(function(playerSocket) {
		while (playerSocket.game.cards.length < 10)
			sendWhiteCard(playerSocket);
	});

	io.sockets.in(gameID).emit('status', { actionRequired: 1, waitingOn: 'Play a white card' });
	io.sockets.in(games[gameID].czar).emit('status', { actionRequired: 0, waitingOn: 'Waiting on player card choices' });
	io.sockets.in(gameID).emit('state',"playCard");
	io.sockets.in(games[gameID].czar).emit('state',"null");

	if (games[gameID].timeoutEnabled) {
		games[gameID].timeout = setTimeout(function() { roundTimeout(gameID) }, timeOut);
		sendTimeout(gameID, timeOut);
	}


	function setCzar(gameID) {
		var players = getSocketsInRoom(gameID);
		var currentCzar = getSocketFromID(games[gameID].czar);

		var czarIndex = players.indexOf(currentCzar);
		if (czarIndex === -1 || !players[czarIndex+1] ) {
			//io.sockets.in(gameID).emit('log', 'Next Czar not found, starting from beginning of array.');
			games[gameID].czar = players[0].id;
			return;
		}
		games[gameID].czar = players[czarIndex+1].id;
	}
}


/**
 *	Function is called when a round times out
 *	The function will check if any cards have been played and if so display them to the Czar in game
 *	@param	{String} gameID	
 */
function roundTimeout(gameID) {
	if (!games[gameID]) return;
	clearTimeout(games[gameID].timeout);
	clearClientTimeout(gameID);
	var czarName = typeof getSocketFromID(games[gameID].czar) === "undefined" ? "Nobody" : getSocketFromID(games[gameID].czar).game.name;
	
	//TODO check if all players submitted cards
	var playerCount = getSocketsInRoom(gameID);
	if (games[gameID].cardsPlayed.length !== playerCount.length-1) 	
		io.sockets.in(gameID).emit('log', 'Round '+games[gameID].round +' timed out.');

	io.sockets.in(gameID).emit('status', { actionRequired: 0, waitingOn: 'Waiting For Czar '+czarName+' to pick the best card' });
	io.sockets.in(games[gameID].czar).emit('status',{ actionRequired: 1, waitingOn: 'You are the Czar, pick the best card played' });
	io.sockets.in(gameID).emit('state',"none");
	io.sockets.in(games[gameID].czar).emit('state',"czarChoose");
	
	// Check if cards were played this round 
	if (games[gameID].cardsPlayed.length) {
		var cards = [];
		games[gameID].cardsPlayed.forEach(function(card){ cards.push(card.card); });

		io.sockets.in(gameID).emit('showPlayedCards',cards);
	} else {
		io.sockets.in(gameID).emit('log', 'No cards were played this round, the next round will start in ' + secondsDelayBetweenRounds + ' seconds.');
		startRound(gameID);
	}

}


/**
 *	Returns a socket object from a socket ID
 *	@param	{String} id	Socket ID
 *	@return {Socket} Socket objects
 */
function getSocketFromID(id) {
	return io.sockets.connected[id];
}


/**
 *	Returns an array of all sockets in a socket.io room
 *	@param	{String}	roomID
 *	@return {Array}		An array of socket objects in the specified room
 */
function getSocketsInRoom(roomID) {
	var socketsInRoom = [];

	// Get the socket IDs of all players in a room
	var playerIDs = io.sockets.adapter.rooms[roomID];
	for(var id in playerIDs) { 
		var playerSocket = getSocketFromID(id);
		socketsInRoom.push(playerSocket);
	}
	return socketsInRoom;
}


/**
 *	Sends a new black card to all clients in a game
 *	@param {String}	gameID
 */
function sendBlackCard(gameID) {
	var blackCard = blackCards[Math.floor(Math.random() * blackCards.length)];
	io.sockets.in(gameID).emit('newBlackCard', blackCard);
}


/**
 *	Sends a white card to the client
 *	@param {Socket}	socket
 *	@param {Number}	cardsToSend
 */
function sendWhiteCard(socket) {
	var card = whiteCards[Math.floor(Math.random() * whiteCards.length)];
	socket.game.cards.push(card);
	io.sockets.in(socket.id).emit('newWhiteCard', card);
}


/**
 *	Sends updated information to the clients in a game regarding which players are in the current game
 *	@param {String}	gameID
 */
function updatePlayerList(gameID) {
	if (!games[gameID]) return;

	var playerList = [];
	var players = getSocketsInRoom(gameID);

	if (players.length === 0) {
		delete games[gameID];
		availableIDs.push(gameID);
		console.log("Game deleted: "+gameID);
		return;
	}

	games[gameID].playerCount = players.length;

	players.forEach(function(socket) {
		playerList.push(
			{
				playerName: socket.game.name,
				playerStatus: socket.game.status,
				playerScore: socket.game.score,
				czar: games[gameID].czar === socket.id
			}
		);
	});

	var data = {
		playerCount: playerList.length,
		maxPlayers: games[gameID].maxPlayers,
		playerList: playerList
	};

	io.sockets.in(gameID).emit('updatePlayers', data);
}


/**
 *	Retrieves game data from a game ID. Dosen't really have a purpose
 *	@param {String}	gameID
 */
function getGameData(gameID) {
	var gameData = games[gameID];

	if (!gameData) return 'Game not found.';

	return gameData;
}

function sendTimeout(gameID, timeout) {
	io.sockets.in(gameID).emit('setTimeout', timeout);
}

function clearClientTimeout(gameID) {
	io.sockets.in(gameID).emit('clearTimeout');
}
