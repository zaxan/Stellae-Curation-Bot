const Discord = require('discord.js')
var steem = require('steem')
var dsteem = require("dsteem")
var fs = require("fs")
var moment = require("moment")
var whitelistjs = require("./whitelist.js")
var api = require("./api")


var config = {}
var whitelist = []
var times = {}

api.start()


var token = config["discordToken"]
var prefix = config["prefix"]
var botCommandRoleName = config["botCommandRole"]
var version = config["version"]
var steemAccount = config["accountName"]
var minTimeWhitelisted = config["minTimeWhitelisted"]
var maxTimeWhitelisted = config["maxTimeWhitelisted"]
var minTimeNotWhitelisted = config["minTimeNotWhitelisted"]
var maxTimeNotWhitelisted = config["maxTimeNotWhitelisted"]
var minimumPowerToVote = config["minimumPowerToVote"]
var extraMessage = config["extraMessage"]
var drottoEnabled = config["drottoEnabled"]
var drottoAmount = config["drottoAmount"]
var voteWhiteListed = config["voteWhiteListed"]
var voteNonWhiteListed = config["voteNonWhiteListed"]
var allowComments = config["allowComments"]

loadConfig()
loadWhitelist()
loadTimes()


var client = new dsteem.Client('https://api.steemit.com')


const bot = new Discord.Client();




bot.on('ready', () => {
    console.log('¡Stellae a iniciado!');
    bot.user.setActivity(prefix + "help", {
        type: 'PLAYING'
    });
});

bot.on('message', message => {
    if (message.author.bot) return;
    loadConfig()
    loadWhitelist()
    loadTimes()

    var botCommandId = -1
    try {
        botCommandId = message.guild.roles.find("name", botCommandRoleName).id
    } catch (err) {
        console.log("El Rol no existe")
    }

    var isBotCommander = false
    try {
        isBotCommander = message.member.roles.has(botCommandId)
    } catch (err) {
        console.log("El rol de curador fallo")
    }

    if (message.content.indexOf(prefix) === 0) {
        console.log(message.content)
        var afterPrefix = message.content.split(prefix).pop()
        var splitMessage = afterPrefix.split(" ")
        var command = splitMessage[0]
        console.log(command)

        if (command == "help") {
            message.channel.send("<@" + message.author.id + "> Para votar un post con @" + steemAccount + ", solo escribe `" + prefix + "upvote (linkdelpost)`. El post puede ser de steemit, busy, steempeak o cualquier frond-end que use @author/permlink format. " + botCommandRoleName + " pueden usar `" + prefix + "add (steem usuario)` para agregar al usuario al whitelist `" + prefix + "remove (steem usuario)` para quitarlo del whitelist. `" + prefix + "value` {Poder de voto entre 0.01 y 100} para colocar el bot en un porcentaje personalizado. `" + prefix + "power` para ver el vp restante de la cuenta.")
        }

        if (command == "version" || command == "v") {
            message.channel.send("<@" + message.author.id + "> muestra la version actual del bot " + version + ".")
        }

        if (command == "upvote") {
            steem.api.getAccounts([steemAccount], function (err, response) {
                var secondsago = (new Date - new Date(response[0].last_vote_time + "Z")) / 1000;
                var vpow = response[0].voting_power + (10000 * secondsago / 432000);
                var vp = Math.min(vpow / 100, 100).toFixed(2);
                if (vp >= minimumPowerToVote) {
                    var link = splitMessage[1]
                    var whole = link.split("@").pop()
                    whole = whole.split("/")
                    console.log(whole)
                    let wif = config["privatePostingKey"]
                    let voter = steemAccount
                    let author = whole[0].toLowerCase()
                    var permlink = whole[1]
                    try {
                        permlink = permlink.toLowerCase()
                    } catch (err) {
                        console.log(err)
                        message.channel.send("<@" + message.author.id + "> Error, intentalo de nuevo." + extraMessage)
                        return
                    }

                    loadTimes()
                    let authorLastVoteDate = times[author]

                    let currentUTC = moment.utc()
                    var differenceVoted = currentUTC.diff(authorLastVoteDate, 'minutes')

                    if (authorLastVoteDate == null) {
                        differenceVoted = 1441
                    }
                    if (differenceVoted >= 1440) {
                        steem.api.getContent(author, permlink, function (err, result) {
                            if (err == null) {
                                var isComment = true
                                if (result.parent_author == "") {
                                    isComment = false
                                }

                                var time = result["created"]
                                var createdTime = moment.utc(time)
                                var now = moment.utc()
                                var difference = now.diff(createdTime, 'minutes')
                                if (allowComments || !isComment) {
                                    if (whitelist.includes(author)) {

                                        if (difference >= minTimeWhitelisted && difference <= maxTimeWhitelisted) {
                                            voteNow(wif, voter, author, permlink, voteWhiteListed * 100, message, true);
                                        } else {
                                            message.channel.send("<@" + message.author.id + "> Solo puedes votar post con " + minTimeWhitelisted + " minutos y " + (maxTimeWhitelisted / 1440) + " dias para personas en whitelist. Este post no cumple las condiciones." + extraMessage)
                                        }
                                    } else {
                                        if (difference >= minTimeNotWhitelisted && difference <= maxTimeNotWhitelisted) {
                                            voteNow(wif, voter, author, permlink, voteNonWhiteListed * 100, message, false);
                                        } else {
                                            message.channel.send("<@" + message.author.id + "> Solo puedes votar post con " + minTimeNotWhitelisted + " minutos y " + (maxTimeNotWhitelisted / 1440) + " dias para personas en whitelist. Este post no cumple las condiciones." + extraMessage)
                                        }
                                    }
                                } else {
                                    message.channel.send("<@" + message.author.id + "> No estan permitidos los comentarios.")
                                }
                            } else {
                                message.channel.send("<@" + message.author.id + "> Post no encontrado. Usa otro link?")
                            }
                        })
                    } else {
                        var timeLeft = moment.duration(4320 - differenceVoted, "minutes")._data
                        console.log(timeLeft)
                        if (timeLeft.days == 0) {
                            message.channel.send("<@" + message.author.id + "> Solo puedes votar al mismo usuario cada 3 dias. Intenta de nuevo en " + timeLeft.hours + " horas y " + timeLeft.minutes + " minutos.")
                        } else {
                            message.channel.send("<@" + message.author.id + "> Mínimo 3 día entre votaciones al mismo usuario. Intenta de nuevo en " + timeLeft.hours + " horas y " + timeLeft.minutes + " minutos.")
                        }
                    }

                } else {
                    message.channel.send("<@" + message.author.id + "> " + steemAccount + " tiene " + vp + "% voting power restante. " + steemAccount + " solo vota cuando tiene " + minimumPowerToVote + "% vp. Intenta de nuevo cuando este recargado. Para obtener el vp actual usa " + prefix + "power." + extraMessage)
                }
            })


        }


        if (command == "power") {
            steem.api.getAccounts([steemAccount], function (err, response) {
                var secondsago = (new Date - new Date(response[0].last_vote_time + "Z")) / 1000;
                var vpow = response[0].voting_power + (10000 * secondsago / 432000);
                var vp = Math.min(vpow / 100, 100).toFixed(2);
                message.channel.send("<@" + message.author.id + "> " + steemAccount + " tiene " + vp + "% voting power restante.")
            })
        }

        if (command == "value") {
            var weight = parseFloat(splitMessage[1])
            if (isNaN(weight) || weight > 100 || 0 > weight) {
                message.channel.send("<@" + message.author.id + "> El modo correcto de usar este comando es `" + prefix + "value {Vote Weight(Between 0.01 and 100)}`. Please try again.")
                return
            }
            steem.api.getRewardFund('post', function (errFunds, responseFunds) {
                var rewardBalance = responseFunds.reward_balance.split(" ")[0]
                var recentClaims = responseFunds.recent_claims
                steem.api.getAccounts([steemAccount], function (errAccount, responseAccount) {
                    var secondsago = (new Date - new Date(responseAccount[0].last_vote_time + "Z")) / 1000;
                    var vpow = responseAccount[0].voting_power + (10000 * secondsago / 432000);
                    var vp = Math.min(vpow / 100, 100).toFixed(2);
                    var shares = parseFloat(responseAccount[0].vesting_shares.split(" ")[0])
                    var recievedShares = parseFloat(responseAccount[0].received_vesting_shares.split(" ")[0])
                    var sentShares = parseFloat(responseAccount[0].delegated_vesting_shares.split(" ")[0])
                    var totalVestingShares = shares + recievedShares
                    totalVestingShares = totalVestingShares - sentShares
                    steem.api.getCurrentMedianHistoryPrice(function (errHistory, resultHistory) {
                        var final_vest = totalVestingShares * 1e6
                        var power = (parseFloat(vp) * parseFloat(weight) / 10000) / 50
                        var rshares = power * final_vest / 10000
                        var estimate = null
                        estimate = (rshares / parseFloat(recentClaims) * parseFloat(rewardBalance) * parseFloat(resultHistory.base.split(" ")[0])) * 10000
                        if (estimate != null) {
                            message.channel.send("<@" + message.author.id + "> " + steemAccount + "'s vote value at " + weight + "% vote weight is estimated to be $" + (Math.round(estimate * 1000) / 1000) + ".")
                        } else {
                            message.channel.send("<@" + message.author.id + "> El modo correcto de usar este comando es `" + prefix + "value {Vote Weight(Between 0.01 and 100)}`. Intenta de nuevo.")
                        }
                    })
                })
            })
        }

        if (command == "add") {
            if (isBotCommander) {
                whitelistjs.addToWhitelist(splitMessage[1].toLowerCase(), message)
            } else {
                message.channel.send("<@" + message.author.id + "> Solo los curadores pueden añadir a la whitelist.")
            }
        }

        if (command == "remove") {
            if (isBotCommander) {
                whitelistjs.removeFromWhitelist(splitMessage[1].toLowerCase(), message)
            } else {
                message.channel.send("<@" + message.author.id + "> Solo los curadores pueden añadir a la whitelist.")
            }
        }

        if (command == "change") {
            if (isBotCommander) {
                var toChange = splitMessage[1]
                var changeTo = splitMessage[2]

                if (config[toChange] != null) {
                    var type = typeof (config[toChange]).toString()
                    if (type == "string") {
                        config[toChange] = changeTo.toString()
                        writeConfig()
                    }
                    if (type == "boolean") {
                        if (changeTo == "true") {
                            config[toChange] = true
                            writeConfig()
                        } else if (changeTo == "false") {
                            config[changeTo] = false
                            writeConfig()
                        } else {
                            message.channel.send("<@" + message.author.id + "> Solo puede ser cambiado a `true` o `false`.")
                        }
                    }
                    if (type == "number") {
                        config[toChange] = parseFloat(number)
                        writeConfig()
                    }
                    console.log(config)

                } else {
                    message.channel.send("<@" + message.author.id + "> No existe. ¿Seguro que tienes el usuario correcto?")
                }
            } else {
                message.channel.send("<@" + message.author.id + "> Solo " + botCommandRoleName + " puede cambiar la configuracion.")
            }
        }
    }

});

function voteNow(wif, voter, author, permlink, weight, message, member) {
    var key = dsteem.PrivateKey.fromString(wif)
    client.broadcast.vote({
        voter: voter,
        author: author,
        permlink: permlink,
        weight: weight
    }, key).then(function (result) {
        var user = message.author.username
        var comment = config["comment"]
        comment = comment.replace(/\{user\}/g, user)
        steem.broadcast.comment(wif, author, permlink, voter, "re-" + permlink, "curado", comment, JSON.stringify({
            app: 'Discord'
        }), function (err, result) {
            console.log(err, result);
            times[author] = moment.utc()
            writeTimes()
            
        });

        if (member) {
            if (drottoEnabled) {
                sendDrottoBid(author, permlink)
            }
            message.channel.send("<@" + message.author.id + "> Post votado." + extraMessage)
        } else {
            message.channel.send("<@" + message.author.id + "> Post votado. Este usuario no esta en whitelist." + extraMessage)
        }
    }, function (error) {
        console.error(error)
        message.channel.send("<@" + message.author.id + "> Hubo un error. No sabemos por qué (todavía). Esperemos que pronto." + extraMessage)
    })
    .then(function (result) {
        //reblog
        const jsonOp = JSON.stringify([
           'reblog',
           {
               account: voter,
               author: author,
               permlink: permlink,
           },
       ]);
       
       const data = {
           id: 'follow',
           json: jsonOp,
           required_auths: [],
           required_posting_auths: [voter],
       };
       
       client.broadcast.json(data, wif).then(
           function(result) {
               console.log('client broadcast result: ', result);
           }, function(error) {
               console.error(error);
           })

        });
       //end reblog
}

function sendDrottoBid(author, permlink) {
    var privateActiveKey = config["privateActiveKey"]
    var memo = "@" + author + "/" + permlink
    steem.broadcast.transfer(privateActiveKey, steemAccount, "stellae", drottoAmount.toString() + " SBD", memo, function (err, result) {
        console.log(err, result);
        if (!err)
        {
            

        }
    });
}


function loadConfig() {
    config = JSON.parse(fs.readFileSync("config.json"));
    token = config["discordToken"]
    prefix = config["prefix"]
    botCommandRoleName = config["botCommandRole"]
    version = config["version"]
    steemAccount = config["accountName"]
    minTimeWhitelisted = config["minTimeWhitelisted"]
    maxTimeWhitelisted = config["maxTimeWhitelisted"]
    minTimeNotWhitelisted = config["minTimeNotWhitelisted"]
    maxTimeNotWhitelisted = config["maxTimeNotWhitelisted"]
    minimumPowerToVote = config["minimumPowerToVote"]
    extraMessage = config["extraMessage"]
    drottoEnabled = config["drottoEnabled"]
    drottoAmount = config["drottoAmount"]
    voteWhiteListed = config["voteWhiteListed"]
    voteNonWhiteListed = config["voteNonWhiteListed"]
    allowComments = config["allowComments"]
}

function writeConfig() {
    fs.writeFile('config.json', JSON.stringify(config, null, 2), function (err) {})
}

function loadWhitelist() {
    whitelist = JSON.parse(fs.readFileSync("whitelist.json"));
}

function loadTimes() {
    times = JSON.parse(fs.readFileSync("times.json"));
}

function writeTimes() {
    fs.writeFile('times.json', JSON.stringify(times, null, 2), function (err) {})
}



 
bot.login(token);
