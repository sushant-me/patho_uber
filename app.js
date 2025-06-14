const carIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/744/744515.png",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

const userIcon = L.icon({
  iconUrl:
    "https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const map = L.map("map").setView([27.7172, 85.324], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const btn = document.getElementById("request-btn");
const statusText = document.getElementById("status-text");
const statusDetails = document.getElementById("status-details");
const statusIcon = document.getElementById("status-icon");
const statusCard = document.getElementById("status-card");
const driverInfo = document.getElementById("driver-info");
const etaValue = document.getElementById("eta-value");
const distanceValue = document.getElementById("distance-value");
const destinationInput = document.getElementById("destination-input");
const suggestionsContainer = document.getElementById("suggestions");
const timeSlider = document.getElementById("timeSlider");
const timeDisplay = document.getElementById("timeValue");
const totalPriceDisplay = document.getElementById("totalPrice");
const basePriceDisplay = document.getElementById("basePrice");
const distancePriceDisplay = document.getElementById("distancePrice");
const timePriceDisplay = document.getElementById("timePrice");
const demandMultiplierDisplay = document.getElementById("demandMultiplier");
const demandStatus = document.getElementById("demand-status");
const vehicleButtons = document.querySelectorAll(".vehicle-button");

const pricing = {
  bike: { base: 50, perKm: 15, perMin: 2, icon: "🛵" },
  economy: { base: 100, perKm: 25, perMin: 3, icon: "🚗" },
  premium: { base: 150, perKm: 40, perMin: 5, icon: "🚙" },
};

let userMarker, carMarker, routeControl;
let rideInProgress = false;
let arrivalInterval;
let currentVehicle = "bike";
let demandMultiplier = 1.0;
let distance = 0;
let time = 0;
let currentPrice = 0;
let destinationCoords = null;
let availableVehicles = { bike: 10, economy: 5, premium: 2 };
let journeyStage = "toUser";

updateUIState("ready");
updatePrice();
updateDemandStatus();

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

async function fetchSuggestions(query) {
  if (query.length < 3) {
    suggestionsContainer.innerHTML = "";
    return;
  }
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=10&bounded=1&viewbox=85,27.5,85.5,27&featuretype=tourist&addressdetails=1`
    );
    const results = await response.json();
    suggestionsContainer.innerHTML = "";
    results.forEach((result) => {
      const suggestion = document.createElement("div");
      suggestion.classList.add("suggestion-item");
      const displayName = result.display_name.split(",")[0];
      const landmark =
        result.address.tourist ||
        result.address.suburb ||
        result.address.city ||
        result.address.town ||
        "";
      suggestion.textContent = `${displayName}, ${landmark}`.trim();
      suggestion.addEventListener("click", () => {
        destinationCoords = [parseFloat(result.lat), parseFloat(result.lon)];
        destinationInput.value = result.display_name;
        suggestionsContainer.innerHTML = "";
        if (userMarker) calculateRouteAndPrice();
      });
      suggestionsContainer.appendChild(suggestion);
    });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    suggestionsContainer.innerHTML =
      "<div class='suggestion-item'>Error fetching locations</div>";
  }
}

destinationInput.addEventListener(
  "input",
  debounce((e) => {
    fetchSuggestions(e.target.value);
  }, 300)
);

vehicleButtons.forEach((button) => {
  button.addEventListener("click", function () {
    vehicleButtons.forEach((btn) => btn.classList.remove("active"));
    this.classList.add("active");
    currentVehicle = this.dataset.type;
    updateDemandStatus();
    updatePrice();
    if (userMarker && destinationCoords) calculateRouteAndPrice();
  });
});

function updateUIState(state) {
  switch (state) {
    case "ready":
      statusText.textContent = "Ready to ride";
      statusDetails.textContent = "Enter a famous place or location to start";
      statusIcon.textContent = "🚗";
      btn.innerHTML =
        '<span class="button-icon">🚖</span><span class="button-text">Request Ride</span>';
      btn.style.backgroundColor = "var(--primary-color)";
      driverInfo.style.display = "none";
      statusCard.classList.remove("arriving");
      break;
    case "searching":
      statusText.textContent = "Finding a driver";
      statusDetails.textContent = "Searching nearby drivers...";
      statusIcon.textContent = "🔍";
      btn.innerHTML =
        '<span class="button-icon">⏳</span><span class="button-text">Searching...</span>';
      btn.style.backgroundColor = "var(--light-text)";
      break;
    case "driver-assigned":
      statusText.textContent = "Driver coming";
      statusDetails.textContent = "Your driver is on the way";
      statusIcon.textContent = pricing[currentVehicle].icon;
      btn.innerHTML =
        '<span class="button-icon">🛑</span><span class="button-text">Cancel Ride</span>';
      btn.style.backgroundColor = "var(--accent-color)";
      driverInfo.style.display = "flex";
      statusCard.classList.add("arriving");
      break;
    case "arrived":
      statusText.textContent = "Driver arrived!";
      statusDetails.textContent = "Your ride is here";
      statusIcon.textContent = "🎉";
      btn.innerHTML =
        '<span class="button-icon">🚗</span><span class="button-text">Start Journey</span>';
      btn.style.backgroundColor = "var(--secondary-color)";
      break;
    case "en-route":
      statusText.textContent = "Heading to destination";
      statusDetails.textContent =
        "Your driver is taking you to your destination";
      statusIcon.textContent = pricing[currentVehicle].icon;
      btn.innerHTML =
        '<span class="button-icon">🛑</span><span class="button-text">Cancel Ride</span>';
      btn.style.backgroundColor = "var(--accent-color)";
      break;
    case "destination-reached":
      statusText.textContent = "Destination reached!";
      statusDetails.textContent = "Thank you for riding with us!";
      statusIcon.textContent = "🏁";
      btn.innerHTML =
        '<span class="button-icon">⭐</span><span class="button-text">Rate Driver</span>';
      btn.style.backgroundColor = "var(--secondary-color)";
      clearInterval(arrivalInterval);
      break;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function calculateRouteAndPrice() {
  if (!userMarker || !destinationCoords) {
    distance = 0;
    time = 0;
    updatePrice();
    return;
  }

  const userCoords = userMarker.getLatLng();
  if (routeControl) map.removeControl(routeControl);

  routeControl = L.Routing.control({
    waypoints: [
      L.latLng(userCoords.lat, userCoords.lng),
      L.latLng(destinationCoords[0], destinationCoords[1]),
    ],
    router: L.Routing.osrmv1({
      serviceUrl: "http://router.project-osrm.org/route/v1",
    }),
    lineOptions: {
      styles: [{ color: "var(--primary-color)", weight: 4 }],
    },
    createMarker: () => null,
    routeWhileDragging: false,
    addWaypoints: false,
  }).addTo(map);

  routeControl
    .on("routesfound", function (e) {
      const route = e.routes[0];
      distance = route.summary.totalDistance / 1000;
      time = Math.round(route.summary.totalTime / 60);
      timeSlider.value = Math.min(time, 60);
      timeDisplay.textContent = time || "-";
      distanceValue.textContent = distance ? distance.toFixed(1) + " km" : "-";
      etaValue.textContent = time ? time + " min" : "-";
      updatePrice();
    })
    .on("routingerror", function () {
      alert("Unable to calculate route. Please try another destination.");
      distance = 0;
      time = 0;
      updatePrice();
    });
}

function updateDemandStatus() {
  const vehicleCount = availableVehicles[currentVehicle];
  if (vehicleCount > 10) {
    demandMultiplier = 1.0;
    demandStatus.textContent = "Low Demand (More vehicles available)";
    demandStatus.style.color = "var(--success)";
  } else if (vehicleCount >= 5) {
    demandMultiplier = 1.3;
    demandStatus.textContent = "Medium Demand (Few vehicles available)";
    demandStatus.style.color = "var(--warning)";
  } else {
    demandMultiplier = 1.8;
    demandStatus.textContent = "High Demand (Less vehicles available)";
    demandStatus.style.color = "var(--danger)";
  }
  updatePrice();
}

function updatePrice() {
  const vehiclePricing = pricing[currentVehicle];
  const basePrice = vehiclePricing.base;
  const distancePrice = distance * vehiclePricing.perKm;
  const timePrice = time * vehiclePricing.perMin;
  currentPrice = (basePrice + distancePrice + timePrice) * demandMultiplier;

  basePriceDisplay.textContent = `NPR ${basePrice.toFixed(2)}`;
  distancePriceDisplay.innerHTML = `Distance (${
    distance ? distance.toFixed(1) : "-"
  } km) <span>NPR ${distancePrice.toFixed(2)}</span>`;
  timePriceDisplay.innerHTML = `Time (${
    time || "-"
  } min) <span>NPR ${timePrice.toFixed(2)}</span>`;
  demandMultiplierDisplay.textContent = `${demandMultiplier.toFixed(1)}x`;
  totalPriceDisplay.textContent = `NPR ${currentPrice.toFixed(2)}`;

  totalPriceDisplay.style.color =
    demandMultiplier > 1.5
      ? "var(--danger)"
      : demandMultiplier > 1.2
      ? "var(--warning)"
      : "var(--dark)";
  demandMultiplierDisplay.style.color =
    demandMultiplier > 1.5
      ? "var(--danger)"
      : demandMultiplier > 1.2
      ? "var(--warning)"
      : "var(--primary-color)";
}

function simulateDriverJourney(userCoords) {
  if (!destinationCoords) {
    alert("Please select a destination.");
    updateUIState("ready");
    return;
  }

  let waypoints = [];
  if (journeyStage === "toUser") {
    waypoints = [
      L.latLng(carMarker.getLatLng().lat, carMarker.getLatLng().lng),
      L.latLng(userCoords[0], userCoords[1]),
    ];
    updateUIState("driver-assigned");
  } else if (journeyStage === "toDestination") {
    waypoints = [
      L.latLng(userCoords[0], userCoords[1]),
      L.latLng(destinationCoords[0], destinationCoords[1]),
    ];
    updateUIState("en-route");
  }

  if (routeControl) map.removeControl(routeControl);

  routeControl = L.Routing.control({
    waypoints: waypoints,
    router: L.Routing.osrmv1({
      serviceUrl: "http://router.project-osrm.org/route/v1",
    }),
    lineOptions: {
      styles: [{ color: "var(--primary-color)", weight: 4 }],
    },
    createMarker: () => null,
    show: false,
  }).addTo(map);

  routeControl
    .on("routesfound", function (e) {
      const route = e.routes[0];
      const coordinates = route.coordinates;
      const totalSteps = coordinates.length;
      let currentStep = 0;

      const initialDistance = calculateDistance(
        waypoints[0].lat,
        waypoints[0].lng,
        waypoints[1].lat,
        waypoints[1].lng
      );
      const initialETA = Math.round(initialDistance * 3 + 1);
      distanceValue.textContent = initialDistance.toFixed(1) + " km";
      etaValue.textContent = initialETA + " min";

      arrivalInterval = setInterval(() => {
        if (currentStep >= totalSteps) {
          if (
            journeyStage === "toUser" &&
            carMarker.getLatLng().distanceTo(L.latLng(userCoords)) < 10
          ) {
            journeyStage = "toDestination";
            updateUIState("arrived");
            carMarker.setPopupContent("Driver has arrived!").openPopup();
          } else if (journeyStage === "toDestination") {
            updateUIState("destination-reached");
            carMarker.setPopupContent("Reached destination!").openPopup();
            map.removeControl(routeControl);
            clearInterval(arrivalInterval);
          }
          return;
        }

        const nextCoord = coordinates[currentStep];
        carMarker.setLatLng([nextCoord.lat, nextCoord.lng]);
        map.panTo([nextCoord.lat, nextCoord.lng], {
          animate: true,
          duration: 0.5,
        });

        const remainingDistance = calculateDistance(
          nextCoord.lat,
          nextCoord.lng,
          waypoints[1].lat,
          waypoints[1].lng
        );
        const eta = Math.round(remainingDistance * 3 + 1);
        distanceValue.textContent = remainingDistance.toFixed(1) + " km";
        etaValue.textContent = eta + " min";

        currentStep += Math.floor(totalSteps / 50) || 1;
      }, 100);
    })
    .on("routingerror", function () {
      alert("Unable to calculate driver route.");
      updateUIState("ready");
      clearInterval(arrivalInterval);
      if (carMarker) map.removeLayer(carMarker);
      if (routeControl) map.removeControl(routeControl);
      rideInProgress = false;
    });
}

btn.addEventListener("click", () => {
  if (rideInProgress) {
    if (confirm("Are you sure you want to cancel your ride?")) {
      clearInterval(arrivalInterval);
      if (carMarker) map.removeLayer(carMarker);
      if (routeControl) map.removeControl(routeControl);
      rideInProgress = false;
      updateUIState("ready");
    }
    return;
  }

  if (!destinationCoords) {
    alert("Please select a famous place or location.");
    return;
  }

  if (navigator.geolocation) {
    updateUIState("searching");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userCoords = [pos.coords.latitude, pos.coords.longitude];

        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker(userCoords, { icon: userIcon })
          .addTo(map)
          .bindPopup("Your location")
          .openPopup();

        map.setView(userCoords, 16);
        calculateRouteAndPrice();

        setTimeout(() => {
          rideInProgress = true;
          journeyStage = "toUser";

          const angle = Math.random() * Math.PI * 2;
          const distance = 0.015;
          const driverCoords = [
            userCoords[0] + Math.cos(angle) * distance,
            userCoords[1] + Math.sin(angle) * distance,
          ];

          if (carMarker) map.removeLayer(carMarker);
          carMarker = L.marker(driverCoords, { icon: carIcon })
            .addTo(map)
            .bindPopup("Your driver is coming");

          simulateDriverJourney(userCoords);
        }, 2000 + Math.random() * 1000);
      },
      (err) => {
        updateUIState("ready");
        alert("Error: " + err.message);
      }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
    updateUIState("ready");
  }
});

// Add event listener for Start Journey button
btn.addEventListener("click", () => {
  if (rideInProgress && updateUIState("arrived")) {
    if (journeyStage === "toDestination") {
      simulateDriverJourney(userMarker.getLatLng());
    }
  }
});

function simulateVehicleAvailability() {
  setInterval(() => {
    availableVehicles = {
      bike: Math.floor(Math.random() * 15) + 5,
      economy: Math.floor(Math.random() * 10) + 3,
      premium: Math.floor(Math.random() * 5) + 1,
    };
    updateDemandStatus();
  }, 15000);
}

simulateVehicleAvailability();
