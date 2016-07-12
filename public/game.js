Object.prototype.forEach=function(c){for(var b=Object.keys(this),a=0;a<b.length;a++)c(this[b[a]])};
	var socket = io();
	var cardsPlayed = 0;
	var state = "none";

	function updateUI() {
		scaleCard(document.getElementById("czar-card"));
		[document.getElementById("playedCards"),cardHandler.cardsContainerElem].forEach(function(elem){
			elem.children.forEach(function(i) {
				scaleCard(i);
			});
		});
	}
	window.onresize = updateUI;

	function setBlackCard(text) {
		document.getElementById("czar-card").children[0].innerText = text;
		logToFeed('The black card for this round is: "' +text +'" ');
	}


	function updatePlayers(data) {

		var playersText = data.playerCount === 1 ? ' Player' : ' Players';
		document.getElementById("playerCount").innerText = data.playerCount + playersText;
		document.getElementById("maxPlayers").innerText = data.maxPlayers + " Max";
		var pListElem = document.getElementById("playerList");
		while (pListElem.firstChild) {
			pListElem.removeChild(pListElem.firstChild);
		}
		data.playerList.forEach(function(player) {
			var playerName = player.playerName;
			var playerStatus = player.playerStatus;
			var playerScore = player.playerScore;
			var czar = player.czar;

			var li = document.createElement("li");
			
			var elem = document.createElement("div");
			elem.className = "playerStatus "+playerStatus;
			elem.innerText = playerStatus;
			li.appendChild(elem);

			elem = document.createElement("div");
			elem.className = "playerName";
			elem.innerText = playerName;
			li.appendChild(elem);

			elem = document.createElement("div");
			elem.className = "playerScore";
			elem.innerText = "Score: "+playerScore;
			
			if (czar) elem.innerText += " Czar";
			li.appendChild(elem);

			pListElem.appendChild(li);
		});
	}

	function logToFeed(textToLog) {
		var feedItem = document.createElement("p");
		feedItem.innerText = textToLog;
		var feed = document.getElementById("feed")
		feed.appendChild(feedItem);
		feed.scrollTop = feed.scrollHeight;	
	}

	

	function scaleCard(card) {
		if (!card) return;
		
		// -11 to account for padding and whitespace
		var maxWidth = (document.getElementById("top").clientWidth / 10) - 11;
		var maxHeight = (card.parentElement.clientHeight);
		

		card.style.width = maxWidth;
		card.style.height = maxWidth * 1.35;
		//card.style.width = card.clientHeight*0.75;
		card.children[0].style.fontSize = card.clientHeight/15;
	}

	function newGame() {
		socket.emit('newGame', {
				password: 'test',
				cardPacks:0,
				maxPlayers:10,
				timeoutEnabled:1
			});

		popup.show("startGame");
		hideSplash();
	}

	function joinGame(game) {
		socket.emit('connectToGame', game);
		hideSplash();
	}

	function startGame() {
		socket.emit('startGame', 0);
		popup.hide();
	}

	function hideSplash() {
		document.getElementById("splash").style.display = 'none';
	}

	function setName() {
		//Check validity of name
		var name = document.getElementById("name").value;

		if (name.length > 30) name = name.slice(0,30);

		socket.emit('setName', name);

		localStorage.name = name;

		document.getElementById("splash").style.display = 'none';
		

		// Figure out what type of game the player is joining
		var url = document.location.pathname;

		if (url.indexOf("/game/new/") > -1) {
			var arr = url.split("/");
			var start = arr.indexOf("new");

			var password = arr[start+1];
			var maxPlayers = arr[start+2];
			var timeoutEnabled = arr[start+3];

			socket.emit('newGame', {
				password: password,
				cardPacks:0,
				maxPlayers: Number(maxPlayers),
				timeoutEnabled: timeoutEnabled
			});
		} else if (url.indexOf("/game/") > -1 && url.length > 6) {
			joinGame(url.slice(6,url.length));
		} else {
			console.error("URL structure not recognised");
		}
	}

	function newGameJoined(gameID) {
		popup.show("startGame");
		history.pushState({}, "New Game Created", "/game/" +gameID);
	}

	function getServers() {
		socket.emit('getServers',0);
	}

	var ui = {
		updateStatus: function(data) {
			var text = data.waitingOn;
			var requiresAction = data.actionRequired;

			var statusBar = document.getElementById("stats-bar");
			var statusText = document.getElementById("stats-text");

			statusText.innerText = text;
			
			if (requiresAction) {
				statusBar.style.backgroundColor = "#CE4848";
			} else {
				statusBar.style.backgroundColor = "#006355";
			}
		},
		setTimeout: function(length) {
			ui.clearTimeout();
			var intervalID = setInterval(() => { length -= 1000; if (length < 0) { clearInterval(intervalID) }; document.getElementById("timeout").innerText = "Timeout: " + length/1000; },1000);
			this.intervalID = intervalID;
		},
		clearTimeout: function() {
			clearInterval(this.intervalID);
			document.getElementById("timeout").innerText = "";
		},
		updateBrowser: function(data) {
			var elem = document.getElementById("gameBrowser");

			//Clear children
			elem.children.forEach(function(child) { 
				if (child.id !== "browserHead")
					elem.removeChild(child);
			});

			if (!data || !data.length) {
				var tableRow = document.createElement('tr');
				tableRow.innerHTML = "No joinable games found.";
				elem.appendChild(tableRow);
				return;
			}
			
			data.forEach(function(server) {
				var tableRow = document.createElement('tr');
				tableRow.innerHTML = "<td>" +server.host + "'s Game</td><td>" +server.playerCount  +"</td><td>" +server.round +"</td>";
				elem.appendChild(tableRow);
			});
		}
		
	};


	var gme = {
		updateState: function(i) {
			state = i;
		},
		selectCard: function(event) {
			var card = event.target;
			if (card.classList.contains("card-inner")) card = card.parentElement;
			var exit = card.classList.contains("selected");
			popup.hide();
			
			cardHandler.cardsContainerElem.children.forEach(function(i) {
				i.classList.remove("selected");
			});
			
			cardHandler.playedCardsContainerElem.children.forEach(function(i) {
				i.classList.remove("selected");
			});

			//Select Card
			if ((state === "playCard" || state === "czarChoose") && !exit) {
				card.classList.add("selected");
				cardHandler.selectedCard = card.children[0].innerText;
				popup.show("confirmCard");
			}
		}
	}

	var cardHandler = {

		cardsContainerElem: document.getElementById("inner-playercards"),
		playedCardsContainerElem: document.getElementById("playedCards"),

		selectedCard: null,

		confirmCard: function() {
			popup.hide();
			if (state === "czarChoose")
				socket.emit('czarChoice', cardHandler.selectedCard);
			else
				socket.emit('playCard', cardHandler.selectedCard);

			state == "none";
		},

		updateWhiteCards: function(data) {
			var cards = data;
			cardHandler.cardsContainerElem.innerHTML = "";
			cards.forEach(function(card) {
				cardHandler.addWhiteCard(card);
			})
		},

		addWhiteCard: function(cardText) {
			cardHandler.cardsContainerElem.appendChild(cardHandler.createCard(cardText));
			logToFeed('New card added to your deck: "' +cardText +'" ');
			updateUI();
		},

		createCard: function(cardText) {
			var card = document.createElement("div");
			card.className = "card";
			card.id = "card"+cardsPlayed;
			card.onclick = gme.selectCard;
			var cardInner = document.createElement("div");
			cardInner.className = "card-inner";
			cardInner.innerText = cardText;
			card.appendChild(cardInner);
			cardsPlayed++;
			return card;
		},

		showBlankCards: function(number) {
			var container = document.getElementById("playedCards");
			container.innerHTML = "";

			for (var i = 0; i < number; i++) {
				container.appendChild(cardHandler.createCard(""));
			}
			updateUI();
		},

		showPlayedCards: function(data) {
			var container = document.getElementById("playedCards");
			container.innerHTML = "";

			data.forEach(function(text) {
				var card = cardHandler.createCard(text);
				card.classList.add("cardRear");
				container.appendChild(card);
				flipCard(card);
			});
			updateUI();

			function flipCard(elem) {
				elem.classList.add("flipCard");
				setTimeout(function() { elem.classList.remove("cardRear"); }, 1000);
				setTimeout(function() { elem.classList.remove("flipCard"); }, 2000);
			}
		},

		czarChoose: function() {
			//status = 'czarChoose';
		}
	}

	var popup = {
		
		containerElem: document.getElementById("popup-container"),

		elem: document.getElementById("popup"),

		buttonElem: document.getElementById("popup").children[0],

		show: function(popupType) {
			if (popupType === "startGame") {
				this.buttonElem.value = "Start Game";
				this.buttonElem.onclick = startGame;
			} else if (popupType === "confirmCard") {
				this.buttonElem.value = "Confirm Card";
				this.buttonElem.onclick = cardHandler.confirmCard;
			}
			this.containerElem.style.display = "block";
		},
		hide: function() {
			this.containerElem.style.display = "none";
		}

	}


	socket.on('log', logToFeed);
	socket.on('updatePlayers',updatePlayers);
	socket.on('newBlackCard',setBlackCard);
	socket.on('newWhiteCard',cardHandler.addWhiteCard);
	socket.on('updateWhiteCards',cardHandler.updateWhiteCards);
	socket.on('serverList',ui.updateBrowser);
	socket.on('status',ui.updateStatus);
	socket.on('state',gme.updateState);
	socket.on('showBlankCards',cardHandler.showBlankCards);
	socket.on('showPlayedCards',cardHandler.showPlayedCards);
	socket.on('newGameJoined',newGameJoined);
	socket.on('setTimeout',ui.setTimeout);
	socket.on('clearTimeout',ui.clearTimeout);
	
	updateUI();

	localStorage.debug = 'none';
