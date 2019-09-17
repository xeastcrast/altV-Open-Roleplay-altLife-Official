import * as alt from 'alt';
import * as chat from '../chat/chat.mjs';
import { Dictionary } from '../configuration/dictionary.mjs';
import { distance, randPosAround } from '../utility/vector.mjs';
import { addXP } from '../systems/skills.mjs';
import { Items } from '../configuration/items.mjs';

const Debug = true;

const Objectives = {
    POINT: 0, // Go to Point
    CAPTURE: 1, // Stand in Point
    HOLD: 2, // Hold 'E'
    MASH: 3, // Mash 'E'
    PLAYER: 4, // Player Type
    ORDER: 5, // Press Keys in Order
    INFINITE: 6 // Repeat any objectives after this.
};

const Modifiers = {
    MIN: 0,
    ON_FOOT: 1,
    IN_VEHICLE: 2,
    PROGRESS: 4,
    SPAWN_VEHICLE: 8,
    REMOVE_VEHICLE: 16,
    PICKUP_PLAYER: 32,
    DROPOFF_PLAYER: 64,
    KILL_PLAYER: 128,
    REPAIR_PLAYER: 256,
    ITEM_RESTRICTIONS: 512,
    MAX: 1024
};

/**
 * Checks if a flag is being used.
 * @param flags
 * @param flagValue
 */
function isFlagged(flags, flagValue) {
    if ((flags & flagValue) === flagValue) {
        return true;
    }
    return false;
}

/**
 * Create an objective to add to a JOB.
 */
class Objective {
    constructor(objectiveType, objectiveFlags) {
        this.type = objectiveType;
        this.flags = objectiveFlags;
        this.rewards = [];
        this.range = 5;
        this.maxProgress = 5;
        this.progress = -1;

        if (this.type === 5) {
            this.word = getWord();
        }
    }

    /**
     * Set the objective position.
     * @param pos vector3
     */
    setPosition(pos) {
        pos.z -= 0.5;
        this.pos = pos;
    }

    /**
     * The distance the player must be in
     * for the objective to be valid.
     * @param pos number
     */
    setRange(range) {
        if (range <= 2) range = 2;
        this.range = range;
    }

    /**
     * Set the objective message for info.
     * @param msg stirng
     */
    setHelpText(msg) {
        this.helpText = msg;
    }

    /**
     * Set an array of rewards to give.
     * [
     * { type: 'item', prop: 'itemKey', quantity: 1 },
     * { type: 'xp', prop: 'agility', quantity: 25 }
     * ]
     * @param arrayOfRewards
     */
    setRewards(arrayOfRewards) {
        this.rewards = arrayOfRewards;
    }

    /**
     * Sound played for each progress tick.
     * @param soundName string
     */
    setEverySound(soundName) {
        this.everySound = soundName;
    }

    /**
     * Sound played at objective completion.
     * @param soundName string
     */
    setFinishSound(soundName) {
        this.finishSound = soundName;
    }

    /**
     * Set the animation to play while doing this objective.
     * @param dict string
     * @param anim string
     * @param flags number
     * @param duration numberInMS
     */
    setAnimation(dict, name, flags, duration) {
        this.anim = {
            dict,
            name,
            flags,
            duration
        };
    }

    /**
     * Display a marker?
     * @param type number
     * @param pos vector3
     * @param dir vector3
     * @param rot vector3
     * @param scale vector3
     * @param r number
     * @param g number
     * @param b number
     * @param a number
     */
    setMarker(type, pos, dir, rot, scale, r, g, b, a) {
        this.marker = {
            type,
            pos,
            dir,
            rot,
            scale,
            r,
            g,
            b,
            a
        };
    }

    /**
     * The blip to set for the objective.
     * @param type number
     * @param color number
     * @param pos vector3
     */
    setBlip(sprite, color, pos) {
        this.blip = {
            sprite,
            color,
            pos
        };
    }

    /**
     * Set a target for the objective.
     * @param target vector3, player, vehicle, etc.
     * @param type vector3, player, vehicle, as string
     */
    setTarget(target, type) {
        this.target = {
            target,
            type
        };
    }

    /**
     * [{ label: 'Pickaxe', inInventory: true, quantity: 1 }]
     * @param arrayOfItems
     */
    setItemRestrictions(arrayOfItems) {
        this.itemRestrictions = arrayOfItems;
    }

    attemptObjective(player, ...args) {
        // Check the Objective
        if (!this.checkObjective(player, args)) {
            player.emitMeta('job:Progress', this.progress);
            return false;
        }

        if (this.rewards.length >= 1) {
            this.rewards.forEach(reward => {
                /*
                 * [
                 * { type: 'item', prop: 'itemKey', quantity: 1 },
                 * { type: 'xp', prop: 'agility', quantity: 25 }
                 * ]
                 */
                if (reward.type === 'xp') {
                    addXP(player, reward.prop, reward.quantity);
                }

                if (reward.type === 'item') {
                    if (Items[reward.prop]) {
                        if (Items[reward.prop].stackable) {
                            player.addItem(
                                { ...Items[reward.prop] },
                                reward.quantity,
                                false
                            );
                            player.send(
                                `${Items[reward.prop].label} was added to your inventory.`
                            );
                        } else {
                            for (let i = 0; i < reward.quantity; i++) {
                                player.addItem({ ...Items[reward.prop] }, 1, false);
                                player.send(
                                    `${Items[reward.prop].label} was added to your inventory.`
                                );
                            }
                        }
                    } else {
                        console.log(`${reward.prop} was not found for a reward.`);
                    }
                }
            });
        }

        // Go To Next Objective
        // Issue Rewards Here
        player.emitMeta('job:Objective', undefined);
        return true;
    }

    checkObjective(player, args) {
        let valid = true;

        // Set the position to the player
        // if the objective doesn't have one.
        if (!this.pos) {
            this.pos = player.pos;
        }

        /**
         * Range Check First
         */
        if (this.type <= 5) {
            if (!isInRange(player, this)) valid = false;
        }

        /**
         * Target objectives have to come first.
         */
        //if ()

        /**
         * We check modifiers after the range check.
         */
        if (isFlagged(this.flags, Modifiers.ON_FOOT) && valid) {
            if (player.vehicle) valid = false;
        }

        if (isFlagged(this.flags, Modifiers.IN_VEHICLE) && valid) {
            if (!player.vehicle) valid = false;
        }

        if (isFlagged(this.flags, Modifiers.PROGRESS) && valid) {
            if (!this.progress) {
                this.progress = 0;
            }
        }

        /**
         * Finally check the base objective type
         */
        if (this.type === Objectives.CAPTURE && valid) {
            valid = capture(player, this);
        }

        if (this.type === Objectives.HOLD && valid) {
            valid = hold(player, this);
        }

        if (this.type === Objectives.MASH && valid) {
            valid = mash(player, this);
        }

        if (this.type === Objectives.ORDER && valid) {
            valid = order(player, this, args);
        }

        return valid;
    }
}

const isInRange = (player, objective) => {
    if (distance(player.pos, objective.pos) >= objective.range) return false;
    return true;
};

/**
 * The Follow Objectives
 * are to be kept seperate; for additional objective modifiers.
 */

// CAPTURE: 1, // Stand in Point
const capture = (player, objective) => {
    objective.progress += 1;
    if (objective.progress < objective.maxProgress) {
        playAnimation(player, objective);
        playEverySound(player, objective);
        return false;
    }
    return true;
};

// HOLD: 2, // Hold 'E'
const hold = (player, objective) => {
    objective.progress += 1;
    if (objective.progress < objective.maxProgress) {
        playAnimation(player, objective);
        playEverySound(player, objective);
        return false;
    }
    return true;
};

// MASH: 3, // Mash 'E'
const mash = (player, objective) => {
    objective.progress += 1;
    if (objective.progress < objective.maxProgress) {
        playAnimation(player, objective);
        playEverySound(player, objective);
        return false;
    }
    return true;
};

// TARGET: 4, // Target
const target = (player, objective) => {
    //
};

// ORDER: 5, // Press Keys in Order
const order = (player, objective, args) => {
    //
};

const getWord = () => {
    const word = Math.floor(Math.random() * (Dictionary.length - 1));
    return Dictionary[word];
};

const playAnimation = (player, objective) => {
    if (objective.anim === undefined) return;
    const anim = objective.anim;
    player.playAnimation(anim.dict, anim.name, anim.duration, anim.flag);
};

const playEverySound = (player, objective) => {
    if (objective.everySound === undefined) return;
    player.playAudio(objective.everySound);
};

class Job {
    constructor(player, name) {
        this.name = name;
        this.objectives = [];
        player.job = this;
    }

    /**
     * Clear the job
     * @param player
     */
    clear(player) {
        let currentJob = player.getMeta('job');
        if (currentJob) {
            // Clear the Job Here
        }
    }

    /**
     * Start the job.
     * @param player
     */
    start(player) {
        player.emitMeta('job:Objective', JSON.stringify(this.objectives[0]));
    }

    /**
     * Add an Objective Class type to loop through.
     * @param objectiveClass
     */
    add(objectiveClass) {
        this.objectives.push(objectiveClass);
    }

    /**
     * Go to the next objective.
     */
    next(player) {
        const lastObjective = this.objectives.shift();
        player.emitMeta('job:ClearObjective', true);

        // Check if an objective is present.
        if (this.objectives[0]) {
            // Append Objective to End of Array
            if (this.infinite) {
                this.objectives.push(lastObjective);
            }

            // If the objective type is infinite; skip it.
            if (this.objectives[0].type === Objectives.INFINITE) {
                this.infinite = true;
                this.objectives.shift();
            }
        } else {
            player.emitMeta('job:Objective', undefined);
            player.send('Job Complete');
            return;
        }

        player.emitMeta('job:Objective', JSON.stringify(this.objectives[0]));
    }

    /**
     * Check an objective.
     * @param player
     * @param args
     */
    check(player, ...args) {
        if (player.checking) return;
        player.checking = true;

        if (!this.objectives[0].attemptObjective(player, ...args)) {
            player.checking = false;
            return;
        }

        player.checking = false;
        this.next(player);
    }
}

export function check(player) {
    if (!player.job) return;
    player.job.check(player);
}

/*
let objectiveModifiers = 0;
objectiveModifiers |= flags.ON_FOOT;
objectiveModifiers |= flags.PROGRESS_BAR;

if (isFlagTicked(objectiveModifiers, flags.IN_VEHICLE)) {
  console.log(true);
} else {
  console.log(false);
}


let typeModifiers = 0;
typeModifiers |= types.POINT;
typeModifiers |= types.HACK;

if (isFlagTicked(typeModifiers, types.POINT)) {
    console.log(true);
}
*/

chat.registerCmd('test', player => {
    player.pos = { x: -1694.181640625, y: 144.24208068847656, z: 63.3714828491211 };

    let job = new Job(player, 'idkwtf');
    let emptyVector = { x: 0, y: 0, z: 0 };

    // 0
    let objective = new Objective(0, 1);
    let pos = { x: -1694.181640625, y: 144.24208068847656, z: 63.3714828491211 };
    objective.setPosition(pos);
    objective.setRange(5);
    objective.setHelpText('Hey 1');
    objective.setBlip(1, 2, pos);
    objective.setMarker(
        1,
        pos,
        emptyVector,
        emptyVector,
        new alt.Vector3(5, 5, 1),
        0,
        255,
        0,
        100
    );
    job.add(copyObjective(objective));

    // 1
    pos = {
        x: -1698.1951904296875,
        y: 150.09451293945312,
        z: 63.37149047851562
    };
    objective.setHelpText('Hey 2');
    objective.setPosition(pos);
    objective.setBlip(1, 2, pos);
    objective.setMarker(
        1,
        pos,
        emptyVector,
        emptyVector,
        new alt.Vector3(5, 5, 1),
        0,
        255,
        0,
        100
    );
    job.add(copyObjective(objective));

    /// 2
    pos = {
        x: -1711.4559326171875,
        y: 168.86724853515625,
        z: 63.37132263183594
    };
    objective.setHelpText('Hey 3');
    objective.setPosition(pos);
    objective.setBlip(1, 2, pos);
    objective.setMarker(
        1,
        pos,
        emptyVector,
        emptyVector,
        new alt.Vector3(5, 5, 1),
        0,
        255,
        0,
        100
    );
    job.add(copyObjective(objective));

    objective = new Objective(6, 1);
    job.add(copyObjective(objective));

    // Capture Type
    objective = new Objective(0, 1);
    pos = { x: -1694.181640625, y: 144.24208068847656, z: 63.3714828491211 };
    objective.setPosition(pos);
    objective.setRange(5);
    objective.setHelpText('Hey 4');
    objective.setBlip(1, 2, pos);
    objective.setMarker(
        1,
        pos,
        emptyVector,
        emptyVector,
        new alt.Vector3(5, 5, 1),
        0,
        255,
        0,
        100
    );
    objective.setEverySound('tick');
    job.add(copyObjective(objective));

    // Capture Type
    objective = new Objective(0, 1);
    pos = {
        x: -1698.1951904296875,
        y: 150.09451293945312,
        z: 63.37149047851562
    };
    objective.setPosition(pos);
    objective.setRange(2);
    objective.setHelpText('Hold ~INPUT_CONTEXT~ to capture.');
    objective.setBlip(1, 2, pos);
    objective.setMarker(
        1,
        pos,
        emptyVector,
        emptyVector,
        new alt.Vector3(1, 1, 1),
        0,
        255,
        0,
        100
    );
    objective.setEverySound('tick');
    job.add(copyObjective(objective));

    // Capture Type
    objective = new Objective(0, 1);
    pos = { x: -1694.181640625, y: 144.24208068847656, z: 63.3714828491211 };
    objective.setPosition(pos);
    objective.setRange(2);
    objective.setHelpText('Mash ~INPUT_CONTEXT~ to capture.');
    objective.setBlip(1, 2, pos);
    objective.setMarker(
        1,
        pos,
        emptyVector,
        emptyVector,
        new alt.Vector3(1, 1, 1),
        0,
        255,
        0,
        100
    );
    objective.setEverySound('tick');
    job.add(copyObjective(objective));

    job.start(player);
});

export function copyObjective(original) {
    var copied = Object.assign(Object.create(Object.getPrototypeOf(original)), original);
    return copied;
}

const trackStart = { x: -1697.0869140625, y: 142.81460571289062, z: 64.37159729003906 };
const trackPoints = [
    { x: -1717.818359375, y: 173.0086669921875, z: 64.37152862548828 },
    { x: -1733.586181640625, y: 191.8198699951172, z: 64.37095642089844 },
    { x: -1764.5313720703125, y: 187.3607177734375, z: 64.37181091308594 },
    { x: -1765.78955078125, y: 156.7715301513672, z: 64.37181091308594 },
    { x: -1748.8880615234375, y: 132.46299743652344, z: 64.37181091308594 },
    { x: -1714.2867431640625, y: 126.52886962890625, z: 64.37163543701172 },
    { x: -1707.92431640625, y: 158.70193481445312, z: 64.37149047851562 }
];

chat.registerCmd('track', player => {
    let job = new Job(player, 'Agility Training');
    let emptyVector = { x: 0, y: 0, z: 0 };
    let obj = new Objective(0, 1);
    obj.setPosition(trackStart);
    obj.setRange(2);
    obj.setHelpText('Go to the starting point.');
    obj.setBlip(1, 2, trackStart);
    obj.setMarker(
        1,
        trackStart,
        emptyVector,
        emptyVector,
        new alt.Vector3(1, 1, 1),
        0,
        255,
        0,
        100
    );
    obj.setRewards([{ type: 'item', prop: 'TrackSuit', quantity: 1 }]);
    job.add(copyObjective(obj));

    // Infinite Loop
    obj = new Objective(6, 1);
    job.add(copyObjective(obj));

    trackPoints.forEach(pos => {
        obj = new Objective(0, 1);
        obj.setHelpText('Sprint!');
        obj.setPosition(pos);
        obj.setBlip(1, 2, pos);
        obj.setMarker(
            1,
            pos,
            emptyVector,
            emptyVector,
            new alt.Vector3(1, 1, 1),
            0,
            255,
            0,
            100
        );
        obj.setRewards([{ type: 'xp', prop: 'agility', quantity: 10 }]);
        job.add(copyObjective(obj));
    });

    job.start(player);
});
