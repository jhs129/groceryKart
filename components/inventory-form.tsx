import { addInventoryItem } from "@/app/actions/inventory";
import { CATEGORIES, LOCATIONS, UNITS } from "@/lib/types";

export function InventoryForm() {
  return (
    <form action={addInventoryItem} className="grid gap-3 border border-line bg-tile p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Item
          <input
            name="name"
            required
            placeholder="Whole milk"
            className="h-10 border border-line bg-paper px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Quantity
          <input
            name="quantity"
            type="number"
            min="0.1"
            step="0.1"
            defaultValue="1"
            className="h-10 border border-line bg-paper px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Unit
          <select name="unit" defaultValue="each" className="h-10 border border-line bg-paper px-3">
            {UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Where
          <select name="location" defaultValue="fridge" className="h-10 border border-line bg-paper px-3">
            {LOCATIONS.map((location) => (
              <option key={location}>{location}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Aisle
          <select name="category" defaultValue="other" className="h-10 border border-line bg-paper px-3">
            {CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Use by
          <input name="expiresAt" type="date" className="h-10 border border-line bg-paper px-3" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="perishable" type="checkbox" defaultChecked className="accent-clementine" />
        Perishable
      </label>
      <button
        type="submit"
        className="h-11 bg-clementine px-4 font-medium text-white hover:bg-[#d24f00]"
      >
        Add to the house
      </button>
    </form>
  );
}
