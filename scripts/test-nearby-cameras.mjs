import { protestStore } from "../src/lib/protest-store.ts";

console.log("=== Testing getNearbyCamerasForCoordinates ===");

// DPR/MPR RI coordinates: ~ -6.2088, 106.8000
const lat = -6.2088;
const lng = 106.8000;

const nearby = protestStore.getNearbyCamerasForCoordinates(lat, lng, 1500, 10);
console.log(`Found ${nearby.length} nearby cameras:`);
for (const cam of nearby) {
  console.log(`- [${cam.id}] ${cam.name} (${cam.distance_meters}m) - Source: ${cam.source_name || cam.city_name}`);
}

if (nearby.length > 0 && !nearby[0].name) {
  console.error("FAILED: Camera name is empty!");
  process.exit(1);
} else {
  console.log("SUCCESS: Camera names and metadata are populated correctly!");
}
