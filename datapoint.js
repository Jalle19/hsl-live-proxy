/**
 * hsl-live-proxy.js
 * @author Sam Stenvall <sam.stenvall@arcada.fi>
 * @license MIT License
 */

/**
 * Represents a datapoint
 * @param {type} properties
 * @returns {undefined}
 */
module.exports = function(properties) {

	/**
	 * "Constructor". Just copy the properties from the passed object
	 * @type @arr;properties
	 */
	for (var i in properties)
		this[i] = properties[i];

	/**
	 * Returns true if this datapoint "matches" the specified subcription
	 * @param {type} subscription
	 * @returns {Boolean}
	 */
	this.matchesSubscription = function(subscription) {
		// Determine if the client should get the data or not
		if (subscription.vehicleType === this.getVehicleType())
		{
			var route = this.getRoute();

			// Check that the route matches
			if (subscription.routes.length === 0 || subscription.routes.indexOf(route) > -1)
				return true;
		}

		return false;
	};

	/**
	 * Returns the vehicle type as a string
	 * @returns {String}
	 */
	this.getVehicleType = function() {
		switch (this.type)
		{
			case 0:
				return 'bus';
			case 1:
				return 'tram';
			case 2:
				return 'metro';
			case 3:
				return 'kutsuplus';
			case 4:
				return 'train';
			case 5:
				return 'ferry';
			default:
				return undefined;
		}
	};

	/**
	 * Turns e.g. 1006 -> 6, 1010 -> 10, 1007B -> 7B
	 * @returns string
	 */
	this.getRoute = function() {
		var route = this.route;

		// Not all data points have a route defined
		if (route === undefined)
			return "";

		// Find the first non-zero character position (excluding the first)
		for (var i = 1; i < route.length; i++)
			if (route.charAt(i) !== '0')
				return route.substr(i).trim();

		return "";
	};

};
