var Requests = function() {
	"use strict";
	var self = {};
	var el;
	var container;
	var scroller;
	var height;
	var fake_hover_timeout;
	var songs = [];
	var dragging_song;
	var dragging_index;
	var order_changed = false;
	var original_mouse_y;

	var mouse_over = function(e) {
		$remove_class(container, "fake_hover");
		if (fake_hover_timeout) {
			clearTimeout(fake_hover_timeout);
			fake_hover_timeout = null;
		}
	};

	var fake_hover = function() {
		fake_hover_timeout = setTimeout(function() { $remove_class(container, "fake_hover"); fake_hover_timeout = null; }, 3000);
		$add_class(container, "fake_hover");
	};

	self.initialize = function() {
		Prefs.define("requests_sticky");
		el = $id("requests_list");
		container = $id("requests");
		if (!Prefs.get("requests_sticky")) {
			container.className = "nonsticky";
		}
		else {
			container.className = "sticky";
		}
		container.addEventListener("mouseover", mouse_over);
		scroller = Scrollbar.new(el);
		scroller.use_fixed = true;
		$id("requests_pin").addEventListener("click", self.swap_sticky);
		$id("requests_header").appendChild($el("span", { "textContent": $l("Requests") }));
		self.on_resize();
		API.add_callback(self.update, "requests");
	};

	self.add = function(song_id) {
		API.async_get("request", { "song_id": song_id });
	};

	self.delete = function(song_id) {
		API.async_get("delete_request", { "song_id": song_id });
	};

	self.swap_sticky = function() {
		if ($has_class(container, "nonsticky")) {
			$add_class(container, "sticky");
			$remove_class(container, "nonsticky");
			Prefs.change("requests_sticky", true);
		}
		else {
			// this little flip prevents the transition on non-sticky behaviour from screwing with the visuals here
			// CAREFUL ORDERING OF THE CSS VALUES is required in requests.css to make sure this is pulled off
			$add_class(container, "nonsticky");
			container.style.transition = "none";
			$remove_class(container, "sticky");
			Fx.delay_css_setting(container, "transition", null);
			Prefs.change("requests_sticky", false);
		}
	};

	self.make_clickable = function(el, song_id) {
		el.addEventListener("click", function() { self.add(song_id); } );
	};

	self.update = function(json) {
		var i, j, found, n;
		if (json.length != songs.length) {
			fake_hover();
		}

		var new_songs = [];
		for (i = json.length - 1; i >= 0; i--) {
			found = false;
			for (j = songs.length - 1; j >= 0; j--) {
				if (json[i].id == songs[j].data.id) {
					songs[j].update(json[i]);
					new_songs.unshift(songs[j]);
					songs.splice(j, 1);
					found = true;
					break;
				}
			}
			if (!found) {
				n = TimelineSong.new(json[i], true);
				n.elements.request_drag.addEventListener("mousedown", start_drag);
				n.el.style[Fx.transform_string] = "translateY(" + height + "px)";
				new_songs.unshift(n);
				el.appendChild(n.el);
			}
		}
		for (i = songs.length - 1; i >= 0; i--) {
			Fx.remove_element(songs[i].el);
		}
		songs = new_songs;
		self.reflow();
	};

	self.on_resize = function(new_height) {
		if (new_height) height = new_height
		if (el) el.style.height = height + "px";
	};

	self.reflow = function() {
		var running_height = 5;
		for (var i = 0; i < songs.length; i++) {
			if (dragging_song != songs[i]) {
				songs[i]._request_y = running_height;
				Fx.delay_css_setting(songs[i].el, "transform", "translateY(" + running_height + "px)");
			}
			running_height += TimelineSong.height;
		}
		scroller.update_scroll_height();
	};

	// DRAG AND DROP *********************************************************

	var start_drag = function(e) {
		if (("_song_id" in e.target) && (e.target._song_id)) {
			for (var i = 0; i < songs.length; i++) {
				if (e.target._song_id == songs[i].data.id) {
					dragging_song = songs[i];
					dragging_index = i;
					break;
				}
			}
			original_mouse_y = Mouse.get_y(e);
			$add_class(dragging_song.el, "dragging");
			$add_class(document.body, "unselectable");
			window.addEventListener("mousemove", continue_drag);
			window.addEventListener("mouseup", stop_drag);
			e.preventDefault();
			return false;
		}
	};

	var continue_drag = function(e) {
		var new_y = dragging_song._request_y - (Mouse.y - Mouse.get_y(e));
		var new_index = Math.floor((new_y + (TimelineSong.height * .3)) / TimelineSong.height);
		if (new_index >= songs.length) new_index = songs.length - 1;
		if (new_index < 0) new_index = 0;
		if (new_index != dragging_index) {
			songs.splice(dragging_index, 1);
			songs.splice(new_index, 0, dragging_song);
			self.reflow();
			dragging_index = new_index;
			order_changed = true;
		}
		dragging_song.el.style[Fx.transform_string] = "translateY(" + new_y + "px)";
	};

	var stop_drag = function(e) {
		$remove_class(dragging_song.el, "dragging");
		$remove_class(document.body, "unselectable");
		window.removeEventListener("mousemove", continue_drag);
		window.removeEventListener("mouseup", stop_drag);
		dragging_song = null;
		self.reflow();

		if (order_changed) {
			var song_order = "";
			for (var i = 0; i < songs.length; i++) {
				if (i !== 0) song_order += ",";
				song_order += songs[i].data.id;
			}
			API.async_get("order_requests", { "order": song_order });
		}
		order_changed = false;
	};

	return self;
}();