---
title: "The Roadster Does Not Fly: Two Gs Down and Two Seconds Up"
date: 2026-10-19T14:00:00+07:00
draft: false
tags: ["tech-news", "hardware", "performance", "math"]
summary: "Tesla put a 56-year-old suction fan and a spacecraft attitude-control system in a road car, and the disclosed numbers say the entire air supply buys under two seconds of thrust."
exercises:
  - number: 1
    question: "Tesla disclosed 250 kg of air and over 80 kN of thrust. How many seconds of full thrust is that?"
    command: "python3 -c 'm=250; F=80e3; ve=60*9.81; print(round(m/(F/ve), 2))'"
    expect: "1.84, seconds, at a cold-gas specific impulse of 60 s."
    accept: "Try 100 instead of 60 and it becomes 3.07 s. The whole air supply is a couple of seconds either way, which is why the demo was a hop and a barrel roll rather than flight."
    wrong_answer: "Reading 600 litres as a large amount of energy. Volume is not the budget, mass flow is, and 80 kN spends mass fast."
  - number: 2
    question: "Nobody at Tesla said the tank pressure. Can the two disclosed numbers pin it?"
    command: "python3 -c 'V=0.6; m=250; R=8.314; T=288; M=0.02896; print(round(m/M*R*T/V/1e5, 1))'"
    expect: "344.5 bar, or about 5,000 psi, from the ideal gas law at 15 C."
    accept: "Real air at that pressure has a compressibility factor above one, so the true figure is higher, and it rises further as the tanks cool while venting. Treat 345 bar as the floor, not the answer."
    wrong_answer: "Assuming the tanks are the constraint. At 345 bar the density is 340 times sea-level air, which is ordinary for a COPV and the reason they can fit in a car at all."
  - number: 3
    question: "Tesla says the tires alone give 1.26 g and the fan adds up to 2 g. What does each ceiling permit on a 1,678 kg car?"
    command: "python3 -c 'v=26.82; g=9.81; print(round(v/(1.26*g), 2), round(v/(2.0*g), 2))'"
    expect: "2.17 1.37, seconds to 60 mph at each traction ceiling."
    accept: "Neither reaches the claimed 0.81 s, which needs 3.38 g and about 56 kN. So the fan and the thrusters are not alternatives: the fan raises the traction ceiling and the thrusters supply force above it."
    wrong_answer: "Crediting the sub-one-second run to the thrusters alone. Rear-mounted thrusters on a 1,678 kg car still have to put the force through something, and at 0.81 s the tires are working at the edge of what the suction gives them."
claims:
  - claim: "Tesla revealed the second-generation Roadster on 15 October 2026 at SpaceX's McGregor, Texas site."
    confidence: "high"
    authority: "Two independent trade reports filed the same evening, with photographs and a livestream recording."
    limitations: "The event was produced by Tesla and attended by invited media, so every specification in it is a company claim, not a measurement."
  - claim: "The suction system produces up to 2 g of downforce, and holds over 2 g in a corner below 50 mph."
    confidence: "medium"
    authority: "Tesla's engineering VP on the record, plus Tesla's own figure of 2 g at 200 mph."
    limitations: "The two statements are about different speeds and different things: 2 g at 200 mph is aerodynamic, while the low-speed figure is the fan. Neither has been measured by anyone outside Tesla."
  - claim: "Ten cold-gas thrusters, two carbon overwrapped pressure vessels totalling 600 litres, 250 kg of air, recharged on board."
    confidence: "high"
    authority: "Stated at the event and repeated in the same trade report with the trim breakdown."
    limitations: "The recharge rate is not disclosed, so the duty cycle between stunts is unknown."
  - claim: "The thrusters produce over 80 kilonewtons."
    confidence: "medium"
    authority: "Said on stage during the demonstration."
    limitations: "No thrust curve, no duration, and no statement of whether that is all ten nozzles or the forward-facing subset. The arithmetic in exercise 3 shows the claimed 0.81 s does not need all of it, which suggests it is a total."
  - claim: "Production starts in 2028."
    confidence: "low"
    authority: "Musk, on stage, adding the word actually with a laugh."
    limitations: "This is the same car that was revealed in 2017 for delivery in a few years, with customer deposits taken since. Nine years of slippage is the base rate to price against."
  - claim: "The pressure vessels are the same class that failed on a Falcon 9 in 2016."
    confidence: "high"
    authority: "SpaceX's own investigation conclusion, and NASA's 2026 work on stress rupture in carbon fibre overwrapped vessels."
    limitations: "The class is the same, the duty cycle is nothing like a rocket's, and no failure mechanism transfers automatically. It is a reason to ask what the qualification standard is, not a prediction."
---

Tesla revealed the second-generation Roadster on 15 October 2026 at SpaceX's test site in McGregor, Texas, and the coverage settled on one word: flying [1][2]. It is the wrong word twice over. The fan system the car is built around produces downforce, which is force toward the ground, and the thrusters that lifted it are cold gas, which is compressed air and not combustion.

Neither of those makes the car unimpressive. It makes it more interesting, because the two systems do opposite jobs and the disclosed numbers put a hard budget on one of them.

> **The 30-Second Diagnosis:** The fan is a 1970 aerodynamic trick that Tesla has packaged for the road, and it works: it holds the car to a surface at a standstill. The thrusters are a spacecraft attitude-control system fed from two pressure vessels holding 250 kg of air, which is under two seconds of full thrust. The car does not fly, it hops, and the interesting engineering is in how the two systems cover for each other.

## Two systems, pointed in opposite directions

The reveal showed one car doing one thing. Underneath it there are two mechanisms with almost nothing in common, and the confusion in the coverage comes from treating them as one.

| | Suction system | Cold-gas thrusters |
| :--- | :--- | :--- |
| Force direction | Toward the ground | Away from it, or sideways |
| What it is for | Traction and cornering | Lift, and rotating the car in the air |
| Working fluid | Air, pulled from under the floor | Air, released from two pressure vessels |
| Works at a standstill | Yes | No, it needs pressure |
| Power source | Four 20 kW electric fans | Stored pressure, spent as mass flow |
| Trim that has it | Performance, Thrust, Rocket | Thrust (rear only), Rocket (ten) |
| Reusable | Continuously | Until the tanks empty |

The fan is the one with real-world consequences and the thrusters are the one that made the video [3]. That ordering is the opposite of how the reveal was reported.

{{< figure src="two-directions.svg" alt="Two panels. On the left, three arrows point down from a bar labelled the car's floor to a bar labelled the road, under the heading Suction system, captioned four fans at 20 kW each giving up to 2 g of downforce that works at a standstill. On the right, three arrows point up from a bar labelled the car, under the heading Cold-gas thrusters, captioned ten nozzles giving over 80 kN from two carbon overwrapped vessels holding 600 litres and 250 kg of air. Below both, a bar filled to 1.84 seconds on a scale running from zero to five seconds, labelled air budget at full thrust." caption="The two systems point in opposite directions, and the entire air supply is under two seconds of thrust" >}}

## The fan is 56 years old, and it has already driven upside down

Ground-effect downforce is not new, and neither is generating it with a fan rather than with speed.

Jim Hall's Chaparral 2J ran in the 1970 Can-Am series with two 17-inch fans driven by a second engine, and its whole purpose was to make downforce independent of how fast the car was going [7]. It was quick when it ran and fragile when it did not.

Eight years later Gordon Murray put one fan on the back of a Brabham, and Niki Lauda won the 1978 Swedish Grand Prix with it. The BT46B raced once, won once, and was withdrawn after rivals objected [8]. The objection was not that it cheated the rules on aerodynamics. It was that the fan was classed as a cooling device, and cooling devices were allowed to move air.

Then the idea went quiet for four decades, and came back electric. The McMurtry Spéirling took the Goodwood hill record in 2022 and its production form claims up to 2,000 kg of downforce from a standstill, generated by fans running at 23,000 rpm [6]. In 2025 McMurtry drove it upside down, held to the underside of a track by suction alone [6][9].

So when the Roadster's presenter said the team looked for the most badass stuff out there and landed on the SR-71, the aerodynamic idea they were actually reviving was in a museum, and its most recent demonstration was a British single-seater hanging from a ceiling.

What Tesla has that McMurtry does not is the packaging argument. Four rear fans at 20 kW each, derived from the 12 kW compressor motor already in the thermal system, and a floor that seals well enough for the differential to build [3]. The physics is undemanding once you see it: holding 2 g on a 1,678 kg car over roughly three square metres of floor is a pressure differential of about 11 kPa, or an eighth of an atmosphere. That is a household vacuum cleaner's order of magnitude spread over a floorpan, which is exactly why it works at zero speed when a wing does nothing.

> The detail worth keeping is that the fan and the wing are not redundant. A wing needs airspeed to make force and makes none at 10 mph. The fan makes its force at 10 mph and is irrelevant at 200. A car with both has downforce across the whole speed range, which is what "sucker mode from zero to 50" is describing.

## The thrusters are spacecraft hardware, and the budget is small

The other half is a cold-gas system, which is the simplest propulsion there is: hold a gas at pressure, open a valve, and let the nozzle convert pressure into thrust [9]. Spacecraft have used it for attitude control since the 1960s because it is safe, it is restartable, and it does not need ignition [10]. Tesla described this exact arrangement eight years earlier, as a package of ten thrusters firing compressed air [5], which makes the 2026 car the delivery of a 2018 promise rather than a new idea.

Its weakness is efficiency. A cold-gas thruster's specific impulse is around 60 seconds, against hundreds for a chemical rocket, because it is expanding a gas rather than burning anything [11]. That number is the one that matters here, because it converts the disclosed air supply into a duration.

| Disclosed | Value |
| :--- | :--- |
| Air mass | 250 kg |
| Tank volume | 600 litres, in two carbon overwrapped vessels |
| Nozzles | 10 |
| Claimed thrust | over 80 kN |
| Stated recharge | on board, no special propellant |

At an optimistic specific impulse of 100 seconds, 80 kN of thrust spends 81.5 kg of air per second, so the whole supply lasts 3.07 seconds. At the 60 seconds a real cold-gas thruster achieves, it lasts 1.84 seconds [1][3][11].

That is the number the coverage did not carry. Every stunt in the reveal fits inside it: a kickflip, a barrel roll, and a landing. It also explains why the tanks take the passenger seat in the Rocket trim, since the air has to go somewhere and there is no second place to put 250 kg of it. That trim is the one Tesla lists as invite-only and not approved for public road use [4], which is a candid way of saying the fastest version is a demonstration rather than a product.

The pressure is the other number nobody stated. Two vessels holding 250 kg in 600 litres works out at a density 340 times that of sea-level air, which the ideal gas law puts at 344.5 bar, or about 5,000 psi, at 15 C. Real gas behaviour at that pressure pushes the true figure higher, and venting cools the tanks and raises it further.

## The two systems cover for each other, and neither one wins alone

The sub-one-second acceleration claim is where the two halves meet, and the arithmetic shows neither half is sufficient.

A 1,678 kg car reaching 60 mph in 0.81 seconds needs an average of 3.38 g, or about 56 kN of net force [2][3]. Tires alone, at the 1.26 g Tesla quotes, cap out at 2.17 seconds. Add the fan's 2 g of suction and the normal load roughly doubles, which lifts the ceiling to about 1.37 seconds.

That is a large improvement and still nowhere near 0.81. The remaining force has to come from the thrusters, which is the reverse of how the trims are usually described: the fan is what makes the thrusters useful, because thrust applied to a car whose tires cannot hold it is thrust wasted.

| Configuration | Traction ceiling | 0-60 mph floor | Force |
| :--- | ---: | ---: | ---: |
| Tires at 1.26 g | 1.26 g | 2.17 s | 20.7 kN |
| Tires plus 2 g of suction | ~2.0 g | 1.37 s | 32.9 kN |
| The claimed 0.81 s run | 3.38 g | 0.81 s | 55.6 kN |

## What the record does not establish

Three things are worth separating from the demonstration.

**The pressure vessels are the interesting risk, not the thrusters.** Tesla said every usable void in the car is packed with carbon fibre overwrapped pressure vessels [1]. That is the same class of hardware that destroyed a Falcon 9 on the pad in 2016, where the investigation concluded that oxygen had accumulated between the liner and the overwrap and ignited [12]. NASA has published work in 2026 on the mechanics of stress rupture in exactly these vessels, which is a good sign that the failure mode is understood and a bad sign about how benign it is [13]. A car is not a rocket, and the duty cycle is nothing alike. But a 345 bar vessel in a road car with a driver sitting beside it deserves a qualification standard, and nobody has said what it is.

**No specification from the reveal has been measured by anyone outside Tesla.** The car that did the stunts was not the car on the stage; the wheels give it away, and a trade report said so plainly [2]. Tesla has taken deposits for this car since 2017, when it was promised in a few years [1].

**The 80 kN figure and the 0.81 second figure do not sit together cleanly.** If all ten nozzles produced 80 kN forward, the car would reach 60 mph in about 0.56 seconds on thrust alone, before the tires contributed anything. The measured 0.81 seconds is slower than that, which suggests the 80 kN is a total across nozzles that point in different directions, or a peak rather than a sustained value. Either is a reasonable design. Neither is what the stage said.

## What would settle it

Two measurements, both of which a third party can make. The first is a thrust stand: ten nozzles, a pressure transducer, and a load cell would turn 80 kN from a claim into a curve with a duration under it. The second is the tank specification, which matters more than the stunt did, because a carbon overwrapped vessel at 345 bar in a road car is the part of this design with a documented failure mode and no published margin.

Until then the accurate sentence is narrower than the coverage. Tesla built a road car around a suction fan that a Can-Am team proved in 1970 and a British single-seater demonstrated upside down in 2025, and bolted a spacecraft attitude-control system to it that has about two seconds of air. That is a real engineering achievement and it is not flight.

## References

[1] [TechCrunch, "Tesla reveals SpaceX-powered Roadster that flies and falls with style", 15 October 2026](https://techcrunch.com/2026/10/15/tesla-reveals-spacex-powered-roadster-that-flies-and-falls-with-style/): the three trims, the reservation prices, the 2028 production claim, the 600 litres and 10 thrusters, and the carbon overwrapped pressure vessel detail.

[2] [Car and Driver, "Revealed! New Tesla Roadster Takes Flight with SpaceX Thrusters", 16 October 2026](https://www.caranddriver.com/news/a74145531/tesla-roadster-revealed/): the fan and wing modes, the over 80 kilonewtons figure, and the observation that the stunt prototype was not the car on the stage.

[3] [Car and Driver, "Explained: Here's How the Tesla Roadster Flies, Flips, and Sucks", 17 October 2026](https://www.caranddriver.com/news/a74165059/tesla-roadster-thrusters-fan-system-explained/): the mass, the 250 kg of air in two 600 litre vessels, the 10 perimeter nozzles, the 2 g downforce figure at 200 mph, the four 20 kW rear fans against a 12 kW base compressor motor, and the sucker-mode quote.

[4] [Tesla, Roadster](https://www.tesla.com/roadster): the manufacturer's own trim descriptions, including active aero, cold-gas thrusters and the multi-mode suction system, and the Rocket trim's status as invite-only and not approved for public road use. The page blocks automated readers, so it is cited rather than quoted at length.

[5] [The Week, "Elon Musk: Tesla Roadster to get SpaceX rockets", 11 June 2018](https://theweek.com/94195/elon-musk-tesla-roadster-to-get-spacex-rockets): the original SpaceX Package claim, ten thrusters firing compressed air, which dates the 2026 reveal as the delivery of an eight-year-old promise.

[6] [McMurtry Automotive, Spéirling PURE production form](https://mcmurtry.com/mcmurtry-speirling-production-form): the modern fan car, up to 2,000 kg of downforce from a standstill and fans at 23,000 rpm, which is the demonstration Tesla's packaging follows. The site blocks automated readers.

[7] [The Petroleum Museum, Chaparral 2J](https://petroleummuseum.org/chaparral-2j): the 1970 Can-Am car that made downforce independent of speed with two 17-inch fans on a second engine, held in the collection that documents Hall's cars.

[8] [The Race, "Nine things you may not know about Brabham's iconic F1 fan car", 24 December 2022](https://www.the-race.com/formula-1/nine-things-you-may-not-know-about-brabhams-iconic-f1-fan-car/): the BT46B, its single race, its single win at Anderstorp in 1978, and the regulatory argument that ended it.

[9] [Jalopnik, "The McMurtry Spéirling Drives Upside Down, Finally Putting A High Downforce Theory Into Practice", 11 April 2025](https://www.jalopnik.com/1832203/mcmurty-speirling-drives-upside-down-downforce): the first car to drive inverted on suction alone, which is the claim the Roadster demonstration echoes rather than originates.

[10] [NASA, Basics of Space Flight, Chapter 11: Onboard Systems](https://science.nasa.gov/learn/basics-of-space-flight/chapter11-2/): attitude and articulation control subsystems, and cold gas as the simplest and most restartable of the options.

[11] [Moog, Cold Gas Thrusters](https://www.moog.com/products/propulsion/space-propulsion/spacecraft-propulsion/thrusters/cold-gas-thruster.html): flight cold-gas thruster specifications with a nominal specific impulse above 60 seconds, which is the number that turns 250 kg of air into under two seconds of thrust.

[12] [Spaceflight Now, "SpaceX failure probe complete; flights to resume Sunday from California", 2 January 2017](https://spaceflightnow.com/2017/01/02/spacex-failure-probe-complete-flights-resume-sunday-from-california): the AMOS-6 investigation conclusion, that oxygen accumulated between the COPV liner and its overwrap.

[13] [NASA/TM-20260002192, "Mechanics Leading to Stress Rupture Failure in Carbon Fiber Composite Overwrapped Pressure Vessels (COPVs)", March 2026](https://ntrs.nasa.gov/api/citations/20260002192/downloads/20260002192.pdf): the current state of understanding for the failure mode that matters if a road car carries 345 bar vessels in every usable void.
