In the admin front end:
- Move recalc buttons into org settings

Add the following to the home page:
- A users funnel chart, showing
    * Total Users 
    * Has Hackatime Account 
    * Created Project 
    * Project with 10+ Hackatime Hours
    * At Least 1 Submission 
    * At Least 1 Approved Hour 
    * 10+ Approved Hours
    * 30+ Approved Hours 
    * 60+ Approved Hours

- User growth
    * Total users
    * New users in the past 30 days
    * New users in the past 7 days
    * % user growth

- Daily Active Users
    * Number of unique users who've recorded time on a linked hackatime project in Horizons today
    * This activity over time (over the past 30 days)
    * % DAU growth since last week (avg)

- Review stats
    * Median review times (over the past 30 days, chart)
    * Tracked hours (All hackatime projects linked to our event)
    * Unshipped hours (Not in review/Not shipped)
    * Shipped hours (Shipped hours, including in review + approved)
    * Hours in review (Shipped hours, excluding approved and rejected hours)
    * Approved hours
    * Weighted grants (Approved hours / 10)

- Review stats, projects
    * Number of Projects Shipped
    * Number of Projects Passing Fraud Check & In Review Queue
    * Number of Projects Reviewed
    * Number of Projects Approved

- Signup stats
    * Signups total (for the Horizons platform)
    * Signups over the past 30 days (chart)
    * Map of signup regions
        * Shows a line between origin country (user) and destination event country (event)
        * Shows # of people in a country planning to attend and which event they plan to attend
    * Table of signups per event
        * Currently no RSVP model in the DB. Use event pins to best approximate this

- Referal stats
    * Create a new utmSource field for users
    * Show utm stats (signups per reason)

New event view:
- /admin/events: https://www.figma.com/design/iKLmJ0jGQBfsQiDt3kTDoe/Horizons?node-id=1335-2253&t=JscXYD6RU3tkzhIy-4
    * Logos pulled from events.yaml (copy into admin frontend)
- /admin/events/[slug]
    * Show event overview
    * Event statistics
        * Users pinned to event (now + over the last 30 days, chart)
        * Pinned users who haven't met hour goal
        * Pinned users who have met hour goal
    * Event detail configurations