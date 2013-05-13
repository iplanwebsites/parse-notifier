
var default_options = {
	push: {
		enabled: true,
		installation_owner: "pn_owner",
		incrementBadge: true
	},
	facebook: {
		enabled: true,
		client_id: null,
		client_secret: null,
		access_token: null,
		facebook_user_id_field: "facebook_id"
	},
	email: {
		enabled: true,
		handler: null
	},
	storage: {
		className: "PNotification",
		user_data_field: "pn_user_data"
	},
	globalSettings: {
		className: "PNotificationSettings",
		email: "pn_emailSetting",
		facebook: "pn_facebookSetting",
		push: "pn_pushSetting",
		userProperty: "pn_settings"
	}
};
var outlets = ["facebook", "push", "mail"];
var _ = require("underscore");

var Notifier = function(options, installation_directory){

	this.options = {};

	var opt_keys = outlets;
	_.each(opt_keys, function(opt_key){
		this.options[opt_key] = _.defaults(options[opt_key], default_options[opt_key]);
	});

	if (!installation_directory) {
		installation_directory = "cloud/libs/parse-notifier";
	}

	if (options.notification_class) {
		Parse.Cloud.afterSave(options.storage.className, this.afterSaveFunction);
	}
	//var Mailer = require(installation_directory+"/lib/Mailer.js");
	//var FBAPI = require(installation_directory+"/lib/Facebook.js");

};

Notifier.prototype.afterSaveFunction = function(request){
	var self = this;
	var notification = request.object;
	var type = notification.get("type");
	var user = notification.get("user");
	user.fetch().then(function(user){
		var settings = user.get(self.options.globalSettings.userProperty);
		if (settings) {
			var setting = settings[type];
			if (setting) {
				_.each(outlets, function(outlet){
					if (self.options[outlet].enabled === true && setting[outlet] === true) {
						// Send the notificaiton to the appropriate outlet
						self.sendToOutlet(notification, outlet, user);
					}
				});
			}
		}
	});
};


Notifier.prototype.registerNotificationType = function(notification_name, options){
	this.options.notifications[notification_name] = options;
};

Notifier.prototype.sendToOutlet = function(notification, outlet, user){
	var self = this;
	var type = notification.get("type");
	var customOptions = this.options.notifications[type];
	var text = notification.get("text");
	var userData = notification.get(self.options.storage.user_data_field);
	switch(outlet){

		case "facebook":
			var fbOptions = {};
			fbOptions.ref = notification.get("type");
			if (userData) {
				fbOptions.href = userData.href;
				text = _.template(text)(userData);
			}
			fbOptions.text = text;
			self.sendFacebookNotification(user, fbOptions);
		break;

		case "push":
			var pushOptions = {};
			if (self.options.push.incrementBadge) {
				pushOptions.badge = "Increment";
			}
			if(customOptions && customOptions.push){
				if (customOptions.sound) {
					pushOptions.sound = customOptions.sound;
				}
				if (customOptions.action) {
					pushOption.action = customOptions.action;
				}
			}

			if (userData) {
				text = _.template(text)(userData);
			}
			pushOptions.alert = text;
			pushOptions.title = text;
			pushOptions.userData = userData;
			self.sendPushNotification(user, pushOptions);
		break;

		case "mail":
			if (customOptions) {
				var emailOptions = customOptions.email;
				if(emailOptions){
					text = _.template(emailOptions.template)(notification.get("pn_user_data"));
					self.sendMailNotification(user, notification);
				}
			}
		break;
	}
};


module.exports  = Notifier;

Notifier.prototype.sendMailNotification = function(user, notification, callback){
	var self = this;
	var handler = self.options.email.handler;
	if (handler) {
		handler.sendNotification(user, notification, callback);
	}
};

Notifier.prototype.sendFacebookNotification = function(user, options, callback){
	var self = this;
	if (!this.options.facebook.access_token) {
		this.getAppAccessToken(function(error, result){
			if (error) {
				callback(error);
			}else{
				self.sendFacebookNotification(user, options, callback);
			}
		});
	}else{
		var user_id = user.get(self.options.facebook.facebook_user_id_field);
		options.access_token = self.options.facebook.access_token;
		Parse.Cloud.httpRequest({
			url: "https://graph.facebook.com/"+user_id+"/notifications",
			method: "POST",
			params: options,
			success: callback,
			error: callback
		});
	}
};

Notifier.prototype.sendPushNotification = function(user, data, callback){
	var self = this;
	var owner_key = self.options.push.installation_owner;
	var pushQuery = new Parse.Query("_Installation");
	pushQuery.equalTo(owner_key, user);

	Parse.Push.send({
		where: pushQuery,
		data: data
	}, {
		success: callback,
		error: callback
	});
};

Notifier.prototype.getAppAccessToken = function(callback){
	var self = this;
	var client_id = this.options.facebook.client_id;
	var client_secret = this.options.facebook.client_secret;
	var options = "client_credentials";
	console.log(client_id);
	console.log(client_secret);
	Parse.Cloud.httpRequest({
		url: "https://graph.facebook.com/oauth/access_token",
		method: "GET",
		params: {
			client_id: client_id,
			client_secret: client_secret,
			grant_type: options
		},
		success: function(httpResponse){
			self.options.facebook.access_token =  httpResponse.text.split("=")[1];
			callback(null, self.options.facebook.access_token);
		},
		error: callback
	});
};